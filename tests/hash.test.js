/**
 * Tests for hash/URL utility functions
 */
process.env.NODE_ENV = 'test';

const {
  generateShortCode,
  hashUrl,
  isValidSlug,
  normalizeUrl,
  isSafeUrl,
} = require('../src/utils/hash');

describe('Hash Utilities', () => {
  // ─── generateShortCode ────────────────────────────────────────────────────
  describe('generateShortCode()', () => {
    it('generates a code of the default length (7)', () => {
      const code = generateShortCode();
      expect(code).toHaveLength(7);
    });

    it('generates a code of a custom length', () => {
      const code = generateShortCode(10);
      expect(code).toHaveLength(10);
    });

    it('generates URL-safe characters only', () => {
      for (let i = 0; i < 50; i++) {
        expect(generateShortCode()).toMatch(/^[a-zA-Z0-9]+$/);
      }
    });

    it('generates unique codes', () => {
      const codes = new Set(Array.from({ length: 1000 }, () => generateShortCode()));
      expect(codes.size).toBe(1000);
    });
  });

  // ─── hashUrl ──────────────────────────────────────────────────────────────
  describe('hashUrl()', () => {
    it('produces the same hash for the same URL', () => {
      const url = 'https://example.com/test?q=1';
      expect(hashUrl(url)).toBe(hashUrl(url));
    });

    it('produces different hashes for different URLs', () => {
      expect(hashUrl('https://example.com/a')).not.toBe(hashUrl('https://example.com/b'));
    });

    it('respects the length parameter', () => {
      expect(hashUrl('https://example.com', 5)).toHaveLength(5);
      expect(hashUrl('https://example.com', 12)).toHaveLength(12);
    });
  });

  // ─── isValidSlug ─────────────────────────────────────────────────────────
  describe('isValidSlug()', () => {
    it('accepts valid slugs', () => {
      expect(isValidSlug('my-link')).toBe(true);
      expect(isValidSlug('abc')).toBe(true);
      expect(isValidSlug('slug_123')).toBe(true);
      expect(isValidSlug('CamelCase')).toBe(true);
      expect(isValidSlug('a'.repeat(32))).toBe(true);
    });

    it('rejects slugs that are too short', () => {
      expect(isValidSlug('ab')).toBe(false);
      expect(isValidSlug('')).toBe(false);
    });

    it('rejects slugs that are too long', () => {
      expect(isValidSlug('a'.repeat(33))).toBe(false);
    });

    it('rejects slugs with invalid characters', () => {
      expect(isValidSlug('has space')).toBe(false);
      expect(isValidSlug('has/slash')).toBe(false);
      expect(isValidSlug('has@symbol')).toBe(false);
      expect(isValidSlug('has.dot')).toBe(false);
    });
  });

  // ─── normalizeUrl ─────────────────────────────────────────────────────────
  describe('normalizeUrl()', () => {
    it('normalizes a valid HTTPS URL', () => {
      expect(normalizeUrl('https://example.com/path')).toBe('https://example.com/path');
    });

    it('adds trailing slash to bare domains', () => {
      expect(normalizeUrl('https://example.com')).toBe('https://example.com/');
    });

    it('preserves query strings and fragments', () => {
      const url = 'https://example.com/path?foo=bar&baz=1#section';
      expect(normalizeUrl(url)).toBe(url);
    });

    it('accepts http:// URLs', () => {
      expect(() => normalizeUrl('http://example.com')).not.toThrow();
    });

    it('throws on invalid URL', () => {
      expect(() => normalizeUrl('not-a-url')).toThrow('Invalid URL format');
      expect(() => normalizeUrl('ftp://files.com')).toThrow();
      expect(() => normalizeUrl('')).toThrow();
    });
  });

  // ─── isSafeUrl ────────────────────────────────────────────────────────────
  describe('isSafeUrl()', () => {
    it('allows normal external URLs', () => {
      expect(isSafeUrl('https://google.com')).toBe(true);
      expect(isSafeUrl('https://github.com/user/repo')).toBe(true);
    });

    it('blocks localhost', () => {
      expect(isSafeUrl('http://localhost:3000')).toBe(false);
      expect(isSafeUrl('http://localhost')).toBe(false);
    });

    it('blocks 127.0.0.1', () => {
      expect(isSafeUrl('http://127.0.0.1')).toBe(false);
    });

    it('blocks private IP ranges', () => {
      expect(isSafeUrl('http://192.168.1.1')).toBe(false);
      expect(isSafeUrl('http://10.0.0.1')).toBe(false);
      expect(isSafeUrl('http://172.16.0.1')).toBe(false);
    });

    it('returns false for malformed URLs', () => {
      expect(isSafeUrl('not-a-url')).toBe(false);
    });
  });
});