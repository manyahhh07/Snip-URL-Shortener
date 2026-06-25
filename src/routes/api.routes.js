const express = require('express');
const router = express.Router();
const controller = require('../controllers/url.controller');
const { shortenUrlValidation } = require('../middleware/validators');
const { createUrlLimiter } = require('../middleware/rateLimiter');

// Stats
router.get('/stats', controller.getStats);

// List all URLs
router.get('/urls', controller.listUrls);

// Get URL info
router.get('/urls/:code', controller.getUrlInfo);

// Get analytics
router.get('/urls/:code/analytics', controller.getAnalytics);

// Create short URL
router.post('/shorten', createUrlLimiter, shortenUrlValidation, controller.shortenUrl);

// Delete URL
router.delete('/urls/:code', controller.deleteUrl);

module.exports = router;