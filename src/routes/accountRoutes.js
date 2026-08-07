const express = require('express');
const profileController = require('../controllers/profileController');
const { serveSpa } = require('../lib/serveSpa');

const router = express.Router();

// FGA-style login-redirect guard for shell routes, matching the pattern in
// catalogRoutes.js/catalogController.requireLoginForWatchlist - preserves
// the pre-migration UX of sending an anonymous visitor straight to /login
// with a redirectTo, rather than a generic API 401.
function requireLoginRedirect(req, res, next) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent(req.originalUrl)}`);
    }
    next();
}

router.get('/account/profile', requireLoginRedirect, serveSpa);
// Public (no login required) - unchanged by the migration, see
// profileController.serveAvatar's own comment. Referenced directly as an
// <img src> both by the remaining EJS pages and by client/src/components/
// Avatar.jsx, so its URL shape can't change.
router.get('/account/avatar/:username', profileController.serveAvatar);

router.get('/account/sessions', requireLoginRedirect, serveSpa);
router.get('/account/webhooks', requireLoginRedirect, serveSpa);

module.exports = router;
