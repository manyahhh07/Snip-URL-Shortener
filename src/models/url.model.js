const { getDb } = require('../config/database');
const { generateShortCode } = require('../utils/hash');
const logger = require('../utils/logger');

class UrlModel {
  /**
   * Create a new shortened URL
   * @param {Object} options
   * @returns {Object} Created URL record
   */
  static create({ originalUrl, customSlug = null, expiresAt = null, creatorIp = null }) {
    const db = getDb();

    // Use custom slug or generate a unique short code
    let shortCode = customSlug || generateShortCode();

    // Handle collisions for generated codes
    if (!customSlug) {
      let attempts = 0;
      while (attempts < 5) {
        const existing = this.findByShortCode(shortCode);
        if (!existing) break;
        shortCode = generateShortCode();
        attempts++;
      }
      if (attempts === 5) {
        shortCode = generateShortCode(10); // fallback to longer code
      }
    }

    const stmt = db.prepare(`
      INSERT INTO urls (short_code, original_url, custom_slug, expires_at, creator_ip)
      VALUES (?, ?, ?, ?, ?)
    `);

    try {
      const result = stmt.run(shortCode, originalUrl, customSlug, expiresAt, creatorIp);
      logger.debug(`Created short URL: ${shortCode} -> ${originalUrl}`);
      return this.findById(result.lastInsertRowid);
    } catch (err) {
      const msg = err.message || '';
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || msg.includes('UNIQUE constraint failed')) {
        throw new Error('Short code or slug already exists');
      }
      throw err;
    }
  }

  /**
   * Find a URL by its short code
   */
  static findByShortCode(shortCode) {
    const db = getDb();
    return db.prepare('SELECT * FROM urls WHERE short_code = ?').get(shortCode);
  }

  /**
   * Find a URL by its ID
   */
  static findById(id) {
    const db = getDb();
    return db.prepare('SELECT * FROM urls WHERE id = ?').get(id);
  }

  /**
   * Find a URL by the original URL (deduplication)
   */
  static findByOriginalUrl(originalUrl) {
    const db = getDb();
    return db
      .prepare('SELECT * FROM urls WHERE original_url = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime("now"))')
      .get(originalUrl);
  }

  /**
   * Increment click count and record analytics
   */
  static recordClick(urlId, { referrer, userAgent, ipAddress } = {}) {
    const db = getDb();

    // Atomic increment
    db.prepare('UPDATE urls SET click_count = click_count + 1 WHERE id = ?').run(urlId);

    // Record analytics if enabled
    if (process.env.ENABLE_ANALYTICS !== 'false') {
      db.prepare(`
        INSERT INTO analytics (url_id, referrer, user_agent, ip_address)
        VALUES (?, ?, ?, ?)
      `).run(urlId, referrer || null, userAgent || null, ipAddress || null);
    }
  }

  /**
   * Get all URLs (paginated)
   */
  static getAll({ page = 1, limit = 20, search = '' } = {}) {
    const db = getDb();
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM urls WHERE is_active = 1';
    const params = [];

    if (search) {
      query += ' AND (original_url LIKE ? OR short_code LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const urls = db.prepare(query).all(...params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM urls WHERE is_active = 1';
    const countParams = [];
    if (search) {
      countQuery += ' AND (original_url LIKE ? OR short_code LIKE ?)';
      countParams.push(`%${search}%`, `%${search}%`);
    }
    const { total } = db.prepare(countQuery).get(...countParams);

    return { urls, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /**
   * Get analytics for a specific URL
   */
  static getAnalytics(shortCode) {
    const db = getDb();
    const url = this.findByShortCode(shortCode);
    if (!url) return null;

    const clicksByDay = db.prepare(`
      SELECT date(clicked_at) as date, COUNT(*) as clicks
      FROM analytics
      WHERE url_id = ?
      GROUP BY date(clicked_at)
      ORDER BY date DESC
      LIMIT 30
    `).all(url.id);

    const topReferrers = db.prepare(`
      SELECT referrer, COUNT(*) as count
      FROM analytics
      WHERE url_id = ? AND referrer IS NOT NULL
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT 10
    `).all(url.id);

    return {
      url,
      totalClicks: url.click_count,
      clicksByDay,
      topReferrers,
    };
  }

  /**
   * Delete (soft delete) a URL
   */
  static delete(shortCode) {
    const db = getDb();
    const result = db
      .prepare('UPDATE urls SET is_active = 0 WHERE short_code = ?')
      .run(shortCode);
    return result.changes > 0;
  }

  /**
   * Get overall statistics
   */
  static getStats() {
    const db = getDb();
    const totalUrls = db.prepare('SELECT COUNT(*) as count FROM urls WHERE is_active = 1').get();
    const totalClicks = db.prepare('SELECT SUM(click_count) as total FROM urls WHERE is_active = 1').get();
    const topUrls = db.prepare(`
      SELECT short_code, original_url, click_count
      FROM urls
      WHERE is_active = 1
      ORDER BY click_count DESC
      LIMIT 5
    `).all();
    const recentUrls = db.prepare(`
      SELECT short_code, original_url, created_at, click_count
      FROM urls
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    return {
      totalUrls: totalUrls.count,
      totalClicks: totalClicks.total || 0,
      topUrls,
      recentUrls,
    };
  }
}

module.exports = UrlModel;