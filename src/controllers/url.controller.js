const { validationResult } = require('express-validator');
const UrlModel = require('../models/url.model');
const { normalizeUrl, isSafeUrl, isValidSlug } = require('../utils/hash');
const logger = require('../utils/logger');

/**
 * POST /api/shorten
 * Create a shortened URL
 */
async function shortenUrl(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }

  const { url, customSlug, expiresIn } = req.body;

  try {
    // Normalize and validate URL
    let normalizedUrl;
    try {
      normalizedUrl = normalizeUrl(url);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid URL format' });
    }

    // SSRF prevention
    if (!isSafeUrl(normalizedUrl)) {
      return res.status(400).json({ success: false, message: 'URL is not allowed' });
    }

    // Validate custom slug if provided
    if (customSlug && !isValidSlug(customSlug)) {
      return res.status(400).json({
        success: false,
        message: 'Custom slug must be 3-32 characters (letters, numbers, _ and - only)',
      });
    }

    // Compute expiry
    let expiresAt = null;
    if (expiresIn) {
      const ms = parseDuration(expiresIn);
      if (!ms) {
        return res.status(400).json({ success: false, message: 'Invalid expiresIn value. Use e.g. "7d", "24h", "30m"' });
      }
      expiresAt = new Date(Date.now() + ms).toISOString().replace('T', ' ').split('.')[0];
    }

    // Check for duplicate original URL (deduplication) — skip if custom slug
    if (!customSlug) {
      const existing = UrlModel.findByOriginalUrl(normalizedUrl);
      if (existing) {
        logger.debug(`Returning existing short code for ${normalizedUrl}`);
        return res.status(200).json({ success: true, ...buildResponse(existing, req) });
      }
    }

    const creatorIp = req.ip || req.connection?.remoteAddress;
    const record = UrlModel.create({
      originalUrl: normalizedUrl,
      customSlug: customSlug || null,
      expiresAt,
      creatorIp,
    });

    logger.info(`New short URL created: ${record.short_code}`);
    return res.status(201).json({ success: true, ...buildResponse(record, req) });
  } catch (err) {
    if (err.message === 'Short code or slug already exists') {
      return res.status(409).json({ success: false, message: 'Custom slug already taken' });
    }
    logger.error('Error creating short URL', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
}

/**
 * GET /:code
 * Redirect to original URL
 */
async function redirectToUrl(req, res) {
  const { code } = req.params;

  const record = UrlModel.findByShortCode(code);

  if (!record || !record.is_active) {
    return res.status(404).json({ success: false, message: 'Short URL not found' });
  }

  // Check expiry
  if (record.expires_at && new Date(record.expires_at) < new Date()) {
    return res.status(410).json({ success: false, message: 'This short URL has expired' });
  }

  // Record click asynchronously (don't block redirect)
  setImmediate(() => {
    UrlModel.recordClick(record.id, {
      referrer: req.get('Referer') || req.get('referrer'),
      userAgent: req.get('User-Agent'),
      ipAddress: req.ip,
    });
  });

  logger.debug(`Redirecting ${code} -> ${record.original_url}`);
  return res.redirect(301, record.original_url);
}

/**
 * GET /api/urls/:code
 * Get URL info
 */
async function getUrlInfo(req, res) {
  const { code } = req.params;
  const record = UrlModel.findByShortCode(code);

  if (!record || !record.is_active) {
    return res.status(404).json({ success: false, message: 'Short URL not found' });
  }

  return res.json({ success: true, data: buildResponse(record, req) });
}

/**
 * GET /api/urls/:code/analytics
 * Get analytics for a URL
 */
async function getAnalytics(req, res) {
  const { code } = req.params;
  const analytics = UrlModel.getAnalytics(code);

  if (!analytics) {
    return res.status(404).json({ success: false, message: 'Short URL not found' });
  }

  return res.json({ success: true, data: analytics });
}

/**
 * GET /api/urls
 * List all URLs (paginated)
 */
async function listUrls(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const search = req.query.search || '';

  const result = UrlModel.getAll({ page, limit, search });
  return res.json({ success: true, data: result });
}

/**
 * DELETE /api/urls/:code
 * Delete a URL
 */
async function deleteUrl(req, res) {
  const { code } = req.params;
  const deleted = UrlModel.delete(code);

  if (!deleted) {
    return res.status(404).json({ success: false, message: 'Short URL not found' });
  }

  logger.info(`Deleted short URL: ${code}`);
  return res.json({ success: true, message: 'Short URL deleted' });
}

/**
 * GET /api/stats
 * Overall statistics
 */
async function getStats(req, res) {
  const stats = UrlModel.getStats();
  return res.json({ success: true, data: stats });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildResponse(record, req) {
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
  return {
    id: record.id,
    shortCode: record.short_code,
    shortUrl: `${baseUrl}/${record.short_code}`,
    originalUrl: record.original_url,
    clickCount: record.click_count,
    createdAt: record.created_at,
    expiresAt: record.expires_at,
  };
}

/**
 * Parse duration strings like "7d", "24h", "30m" to milliseconds
 */
function parseDuration(str) {
  const match = String(str).match(/^(\d+)(m|h|d|w)$/i);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const map = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
  return value * map[unit];
}

module.exports = {
  shortenUrl,
  redirectToUrl,
  getUrlInfo,
  getAnalytics,
  listUrls,
  deleteUrl,
  getStats,
};