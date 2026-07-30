const express = require('express');
const catalogController = require('../controllers/catalogController');
const { requireFgaPermission } = require('../authz/middleware');

const router = express.Router();

// FGA check needs a logged-in subject to resolve; redirect to login FIRST
// (matching the existing UX) rather than letting requireFgaPermission's
// generic 401 fire for an anonymous browser visitor.
function requireLoginRedirect(req, res, next) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
}

router.get('/', catalogController.home);
router.get('/api/search', catalogController.searchMovies);
router.get(
    '/movie/:id',
    requireFgaPermission('can_discover', (req) => `title:${req.params.id}`, { tier: 'browse' }),
    catalogController.movieDetails
);
router.get(
    '/video/:id',
    requireLoginRedirect,
    requireFgaPermission('can_play', (req) => `title:${req.params.id}`, { tier: 'strict' }),
    catalogController.videoPlayer
);
router.get('/watchlist', catalogController.watchlist);

module.exports = router;
