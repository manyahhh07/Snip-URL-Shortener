/**
 * Tests for URL Model
 */
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ENABLE_ANALYTICS = 'true';

const UrlModel = require('../src/models/url.model');
const { initDb, closeDb } = require('../src/config/database');

beforeAll(async () => { await initDb(); });
afterAll(() => { closeDb(); });

describe('UrlModel', () => {
  // ─── Create ───────────────────────────────────────────────────────────────
  describe('create()', () => {
    it('creates a URL record with a generated short code', () => {
      const record = UrlModel.create({ originalUrl: 'https://example.com' });
      expect(record).toBeDefined();
      expect(record.original_url).toBe('https://example.com');
      expect(record.short_code).toMatch(/^[a-zA-Z0-9]{7}$/);
      expect(record.click_count).toBe(0);
      expect(record.is_active).toBe(1);
    });

    it('creates a URL with a custom slug', () => {
      const record = UrlModel.create({
        originalUrl: 'https://github.com/test',
        customSlug: 'gh-test',
      });
      expect(record.short_code).toBe('gh-test');
      expect(record.custom_slug).toBe('gh-test');
    });

    it('creates a URL with an expiry date', () => {
      const expires = new Date(Date.now() + 86400000).toISOString().replace('T', ' ').split('.')[0];
      const record = UrlModel.create({
        originalUrl: 'https://expires.example.com',
        expiresAt: expires,
      });
      expect(record.expires_at).toBe(expires);
    });

    it('throws on duplicate custom slug', () => {
      UrlModel.create({ originalUrl: 'https://dupe1.com', customSlug: 'dupe-slug' });
      expect(() =>
        UrlModel.create({ originalUrl: 'https://dupe2.com', customSlug: 'dupe-slug' })
      ).toThrow('Short code or slug already exists');
    });
  });

  // ─── Find ─────────────────────────────────────────────────────────────────
  describe('findByShortCode()', () => {
    it('finds an existing record', () => {
      const created = UrlModel.create({ originalUrl: 'https://findme.example.com' });
      const found = UrlModel.findByShortCode(created.short_code);
      expect(found).toBeDefined();
      expect(found.id).toBe(created.id);
    });

    it('returns undefined for a non-existent code', () => {
      const found = UrlModel.findByShortCode('zzznope');
      expect(found).toBeUndefined();
    });
  });

  describe('findByOriginalUrl()', () => {
    it('finds an existing active URL', () => {
      UrlModel.create({ originalUrl: 'https://findorig.example.com' });
      const found = UrlModel.findByOriginalUrl('https://findorig.example.com');
      expect(found).toBeDefined();
    });

    it('returns undefined for unknown URL', () => {
      const found = UrlModel.findByOriginalUrl('https://definitely-not-in-db.com');
      expect(found).toBeUndefined();
    });
  });

  // ─── Click Recording ──────────────────────────────────────────────────────
  describe('recordClick()', () => {
    it('increments the click count', () => {
      const record = UrlModel.create({ originalUrl: 'https://clickme.example.com' });
      expect(record.click_count).toBe(0);

      UrlModel.recordClick(record.id, {
        referrer: 'https://google.com',
        userAgent: 'Jest Test',
        ipAddress: '127.0.0.1',
      });

      const updated = UrlModel.findById(record.id);
      expect(updated.click_count).toBe(1);
    });

    it('increments multiple times correctly', () => {
      const record = UrlModel.create({ originalUrl: 'https://multclick.example.com' });
      UrlModel.recordClick(record.id);
      UrlModel.recordClick(record.id);
      UrlModel.recordClick(record.id);
      const updated = UrlModel.findById(record.id);
      expect(updated.click_count).toBe(3);
    });
  });

  // ─── Analytics ────────────────────────────────────────────────────────────
  describe('getAnalytics()', () => {
    it('returns analytics for an existing URL', () => {
      const record = UrlModel.create({ originalUrl: 'https://analytics.example.com' });
      UrlModel.recordClick(record.id, { referrer: 'https://twitter.com' });
      UrlModel.recordClick(record.id, { referrer: 'https://twitter.com' });
      UrlModel.recordClick(record.id, { referrer: 'https://linkedin.com' });

      const analytics = UrlModel.getAnalytics(record.short_code);
      expect(analytics).toBeDefined();
      expect(analytics.totalClicks).toBe(3);
      expect(analytics.clicksByDay).toBeInstanceOf(Array);
      expect(analytics.topReferrers.length).toBeGreaterThan(0);
      expect(analytics.topReferrers[0].referrer).toBe('https://twitter.com');
      expect(analytics.topReferrers[0].count).toBe(2);
    });

    it('returns null for non-existent short code', () => {
      const result = UrlModel.getAnalytics('zzz999');
      expect(result).toBeNull();
    });
  });

  // ─── List ─────────────────────────────────────────────────────────────────
  describe('getAll()', () => {
    it('returns paginated results', () => {
      const result = UrlModel.getAll({ page: 1, limit: 5 });
      expect(result).toHaveProperty('urls');
      expect(result).toHaveProperty('total');
      expect(result).toHaveProperty('totalPages');
      expect(result.urls.length).toBeLessThanOrEqual(5);
    });

    it('filters by search term', () => {
      UrlModel.create({ originalUrl: 'https://searchable-unique-xyz.com' });
      const result = UrlModel.getAll({ search: 'searchable-unique-xyz' });
      expect(result.urls.length).toBeGreaterThan(0);
      expect(result.urls[0].original_url).toContain('searchable-unique-xyz');
    });
  });

  // ─── Delete ───────────────────────────────────────────────────────────────
  describe('delete()', () => {
    it('soft deletes a URL', () => {
      const record = UrlModel.create({ originalUrl: 'https://deleteme.example.com' });
      const deleted = UrlModel.delete(record.short_code);
      expect(deleted).toBe(true);

      const found = UrlModel.findById(record.id);
      expect(found.is_active).toBe(0);
    });

    it('returns false for non-existent short code', () => {
      const deleted = UrlModel.delete('zzznope2');
      expect(deleted).toBe(false);
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────────────
  describe('getStats()', () => {
    it('returns overall statistics', () => {
      const stats = UrlModel.getStats();
      expect(stats).toHaveProperty('totalUrls');
      expect(stats).toHaveProperty('totalClicks');
      expect(stats).toHaveProperty('topUrls');
      expect(stats).toHaveProperty('recentUrls');
      expect(typeof stats.totalUrls).toBe('number');
    });
  });
});