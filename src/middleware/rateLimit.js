const rateLimit = require('express-rate-limit');

// In-memory store: fine for a single-process deployment. Swap for
// rate-limit-redis the moment there's more than one instance.
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many attempts, please try again later.',
});

module.exports = { globalLimiter, authLimiter };
