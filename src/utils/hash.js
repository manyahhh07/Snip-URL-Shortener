const crypto = require('crypto');

// nanoid v3 is CommonJS compatible
const { customAlphabet } = require('nanoid');

// URL-safe alphabet (no ambiguous chars like 0/O, 1/l/I)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const DEFAULT_LENGTH = parseInt(process.env.SHORT_CODE_LENGTH) || 7;

const nanoid = customAlphabet(ALPHABET, DEFAULT_LENGTH);

/**
 * Generate a random short code using nanoid
 * @param {number} length - Length of the short code
 * @returns {string} - Short code
 */
function generateShortCode(length = DEFAULT_LENGTH) {
  return nanoid(length);
}

/**
 * Generate a deterministic short code from a URL using SHA-256
 * Uses first N chars of base62-encoded hash
 * @param {string} url - The original URL
 * @param {number} length - Desired length
 * @returns {string} - Deterministic short code
 */
function hashUrl(url, length = DEFAULT_LENGTH) {
  const hash = crypto.createHash('sha256').update(url).digest('base64url');
  // Replace non-alphabet chars to keep URL safe
  return hash.replace(/[^a-zA-Z0-9]/g, '').substring(0, length);
}

/**
 * Validate that a custom slug contains only allowed characters
 * @param {string} slug
 * @returns {boolean}
 */
function isValidSlug(slug) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(slug);
}

/**
 * Sanitize and normalize a URL
 * @param {string} url
 * @returns {string}
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Ensure protocol is http or https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return parsed.href;
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * Check if a URL is safe (basic SSRF prevention)
 * Blocks private/reserved IP ranges and localhost
 * @param {string} url
 * @returns {boolean}
 */
function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    const blocklist = [
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      '::1',
    ];

    if (blocklist.includes(hostname)) return false;

    // Block private IP ranges (basic check)
    const privateRanges = [
      /^10\./,
      /^192\.168\./,
      /^172\.(1[6-9]|2\d|3[01])\./,
      /^169\.254\./,
    ];

    if (privateRanges.some(r => r.test(hostname))) return false;

    return true;
  } catch {
    return false;
  }
}

module.exports = {
  generateShortCode,
  hashUrl,
  isValidSlug,
  normalizeUrl,
  isSafeUrl,
};