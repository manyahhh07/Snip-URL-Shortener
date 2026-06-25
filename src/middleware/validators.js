const { body } = require('express-validator');

const shortenUrlValidation = [
  body('url')
    .notEmpty().withMessage('URL is required')
    .isLength({ max: 2048 }).withMessage('URL must be under 2048 characters')
    .trim(),

  body('customSlug')
    .optional()
    .isLength({ min: 3, max: 32 }).withMessage('Custom slug must be 3-32 characters')
    .matches(/^[a-zA-Z0-9_-]+$/).withMessage('Slug can only contain letters, numbers, hyphens, and underscores')
    .trim(),

  body('expiresIn')
    .optional()
    .matches(/^\d+(m|h|d|w)$/i).withMessage('expiresIn must be like "30m", "24h", "7d", "2w"'),
];

module.exports = { shortenUrlValidation };