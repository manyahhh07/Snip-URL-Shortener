/**
 * Integration tests for API endpoints
 */
process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.BASE_URL = 'http://localhost:3000';
process.env.ENABLE_ANALYTICS = 'true';

const request = require('supertest');
const app = require('../src/app');

describe('API Routes', () => {
  // ─── Health Check ─────────────────────────────────────────────────────────
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ─── Shorten URL ──────────────────────────────────────────────────────────
  describe('POST /api/shorten', () => {
    it('shortens a valid URL', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://www.example.com/some/very/long/path?q=test' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.shortUrl).toMatch(/^http:\/\/localhost:3000\/[a-zA-Z0-9_-]+$/);
      expect(res.body.originalUrl).toBe('https://www.example.com/some/very/long/path?q=test');
    });

    it('deduplicates the same URL', async () => {
      const url = 'https://dedupe-test.example.com/path';
      const res1 = await request(app).post('/api/shorten').send({ url });
      const res2 = await request(app).post('/api/shorten').send({ url });

      expect(res1.body.shortCode).toBe(res2.body.shortCode);
    });

    it('accepts a custom slug', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://custom-slug-test.com', customSlug: 'my-custom' });

      expect(res.status).toBe(201);
      expect(res.body.shortCode).toBe('my-custom');
      expect(res.body.shortUrl).toBe('http://localhost:3000/my-custom');
    });

    it('returns 409 on duplicate custom slug', async () => {
      await request(app)
        .post('/api/shorten')
        .send({ url: 'https://first.com', customSlug: 'taken-slug' });

      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://second.com', customSlug: 'taken-slug' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('accepts expiry duration', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://expires.example.com', expiresIn: '7d' });

      expect(res.status).toBe(201);
      expect(res.body.expiresAt).toBeDefined();
    });

    it('rejects a missing URL', async () => {
      const res = await request(app).post('/api/shorten').send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('rejects an invalid URL format', async () => {
      const res = await request(app).post('/api/shorten').send({ url: 'not-a-url' });
      expect(res.status).toBe(400);
    });

    it('rejects a localhost URL (SSRF)', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'http://localhost:8080/admin' });
      expect(res.status).toBe(400);
    });

    it('rejects an invalid custom slug', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://test.com', customSlug: 'ab' }); // too short
      expect(res.status).toBe(400);
    });

    it('rejects an invalid expiresIn format', async () => {
      const res = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://test.com', expiresIn: 'bad' });
      expect(res.status).toBe(400);
    });
  });

  // ─── Redirect ─────────────────────────────────────────────────────────────
  describe('GET /:code', () => {
    it('redirects to the original URL', async () => {
      const create = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://redirect-test.example.com' });

      const res = await request(app).get(`/${create.body.shortCode}`);
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('https://redirect-test.example.com/');
    });

    it('returns 404 for unknown short code', async () => {
      const res = await request(app).get('/zzznope99');
      expect(res.status).toBe(404);
    });
  });

  // ─── URL Info ─────────────────────────────────────────────────────────────
  describe('GET /api/urls/:code', () => {
    it('returns URL info', async () => {
      const create = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://info-test.example.com' });

      const res = await request(app).get(`/api/urls/${create.body.shortCode}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.shortCode).toBe(create.body.shortCode);
    });

    it('returns 404 for unknown code', async () => {
      const res = await request(app).get('/api/urls/notexist');
      expect(res.status).toBe(404);
    });
  });

  // ─── Analytics ────────────────────────────────────────────────────────────
  describe('GET /api/urls/:code/analytics', () => {
    it('returns analytics data', async () => {
      const create = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://analytics-api-test.example.com' });

      // Simulate a click
      await request(app).get(`/${create.body.shortCode}`);

      const res = await request(app).get(`/api/urls/${create.body.shortCode}/analytics`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalClicks');
      expect(res.body.data).toHaveProperty('clicksByDay');
      expect(res.body.data).toHaveProperty('topReferrers');
    });
  });

  // ─── List URLs ────────────────────────────────────────────────────────────
  describe('GET /api/urls', () => {
    it('returns paginated URL list', async () => {
      const res = await request(app).get('/api/urls?page=1&limit=10');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('urls');
      expect(res.body.data).toHaveProperty('total');
      expect(res.body.data).toHaveProperty('page');
    });

    it('supports search filtering', async () => {
      await request(app)
        .post('/api/shorten')
        .send({ url: 'https://searchable-api-xyz.example.com' });

      const res = await request(app).get('/api/urls?search=searchable-api-xyz');
      expect(res.status).toBe(200);
      expect(res.body.data.urls.length).toBeGreaterThan(0);
    });
  });

  // ─── Delete URL ───────────────────────────────────────────────────────────
  describe('DELETE /api/urls/:code', () => {
    it('deletes a URL', async () => {
      const create = await request(app)
        .post('/api/shorten')
        .send({ url: 'https://delete-api-test.example.com', customSlug: 'del-test' });

      const del = await request(app).delete(`/api/urls/${create.body.shortCode}`);
      expect(del.status).toBe(200);
      expect(del.body.success).toBe(true);

      // Confirm it's gone
      const get = await request(app).get(`/api/urls/${create.body.shortCode}`);
      expect(get.status).toBe(404);
    });

    it('returns 404 for non-existent code', async () => {
      const res = await request(app).delete('/api/urls/zzznope-del');
      expect(res.status).toBe(404);
    });
  });

  // ─── Stats ────────────────────────────────────────────────────────────────
  describe('GET /api/stats', () => {
    it('returns system stats', async () => {
      const res = await request(app).get('/api/stats');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalUrls');
      expect(res.body.data).toHaveProperty('totalClicks');
      expect(res.body.data).toHaveProperty('topUrls');
    });
  });

  // ─── 404 Route ────────────────────────────────────────────────────────────
  describe('Unknown Routes', () => {
    it('returns 404 for unknown API routes', async () => {
      const res = await request(app).get('/api/this-does-not-exist');
      expect(res.status).toBe(404);
    });
  });
});