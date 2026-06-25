const express = require('express');
const router = express.Router();
const controller = require('../controllers/url.controller');
const { redirectLimiter } = require('../middleware/rateLimiter');

// Redirect short code to original URL
router.get('/:code([a-zA-Z0-9_-]{3,32})', redirectLimiter, controller.redirectToUrl);

module.exports = router;