const express = require('express');
const catalogController = require('../controllers/catalogController');
const { requireFgaPermission } = require('../authz/middleware');
const { serveSpa } = require('../lib/serveSpa');

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

router.get('/', serveSpa);
// Migrated to React (see the EJS->React migration plan): the route and its
// guards stay exactly where they were, only the handler body changes, so
// there's no big-bang cutover and rollback is reverting one line. The
// guard denies/404s BEFORE any HTML is sent - serving the SPA shell only
// past that point preserves the pre-migration behavior of never rendering
// page chrome for a title a visitor can't discover, and (below) never
// leaking the player chrome to a logged-out visitor.
router.get(
    '/movie/:id',
    requireFgaPermission('can_discover', (req) => `title:${req.params.id}`, { tier: 'browse' }),
    serveSpa
);
router.get(
    '/video/:id',
    requireLoginRedirect,
    requireFgaPermission('can_play', (req) => `title:${req.params.id}`, { tier: 'strict' }),
    serveSpa
);
router.get('/watchlist', catalogController.requireLoginForWatchlist, serveSpa);

module.exports = router;
