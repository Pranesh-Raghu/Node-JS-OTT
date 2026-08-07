// JSON API for the React SPA (client/). Every controller here delegates to
// an existing service/repo - no new business logic lives in this layer.
// Mounted after attachCsrfToken/attachViewHelpers in src/app.js, so
// res.locals.csrfToken and res.locals.theme are already populated.
const express = require('express');
const sessionController = require('../controllers/api/sessionController');
const legacyCatalogController = require('../controllers/catalogController');
const apiCatalogController = require('../controllers/api/catalogController');
const watchlistController = require('../controllers/api/watchlistController');
const apiSessionsController = require('../controllers/api/sessionsController');
const apiWebhooksController = require('../controllers/api/webhooksController');
const apiProfileController = require('../controllers/api/profileController');
const apiAdminController = require('../controllers/api/adminController');
const { setThemeCookie } = require('../lib/theme');
const { requireFgaPermission } = require('../authz/middleware');
const { requireApiLogin, requireApiAdmin } = require('../middleware/requireApiAuth');

const router = express.Router();

router.get('/api/session', sessionController.getSession);

// Relocated from catalogRoutes.js for coherence - same controller
// function, same behavior (deliberately no auth guard: published catalog
// search is public). GET is exempt from CSRF by csrf-sync's default
// ignoredMethods regardless of the /api/* exemption removed from
// src/middleware/csrf.js.
router.get('/api/search', legacyCatalogController.searchMovies);

// Same two guards as the shell route for the same :id
// (src/routes/catalogRoutes.js) - can_discover fails open (tier: 'browse')
// so an FGA outage doesn't take catalog browsing down, can_play fails
// closed (tier: 'strict') since it gates paid content.
router.get(
    '/api/titles/:id',
    requireFgaPermission('can_discover', (req) => `title:${req.params.id}`, { tier: 'browse', json: true }),
    apiCatalogController.getTitle
);
router.get(
    '/api/titles/:id/playable',
    requireApiLogin,
    requireFgaPermission('can_play', (req) => `title:${req.params.id}`, { tier: 'strict', json: true }),
    apiCatalogController.getPlayable
);

router.post('/api/theme', (req, res) => {
    const value = setThemeCookie(res, req.body?.theme);
    res.json({ theme: value });
});

router.get('/api/catalog', apiCatalogController.getCatalogPage);

router.get('/api/watchlist', requireApiLogin, watchlistController.list);
router.post('/api/watchlist', requireApiLogin, watchlistController.add);
router.delete('/api/watchlist/:titleId', requireApiLogin, watchlistController.remove);
router.post('/api/watchlist/import', requireApiLogin, watchlistController.importFromClient);

router.get('/api/account/sessions', requireApiLogin, apiSessionsController.listSessions);
router.delete('/api/account/sessions/:sessionId', requireApiLogin, apiSessionsController.revokeSession);
router.delete('/api/account/sessions', requireApiLogin, apiSessionsController.revokeAllSessions);

router.get('/api/account/webhooks', requireApiLogin, apiWebhooksController.list);
router.post('/api/account/webhooks', requireApiLogin, apiWebhooksController.create);
router.post('/api/account/webhooks/:id/toggle', requireApiLogin, apiWebhooksController.toggle);
router.delete('/api/account/webhooks/:id', requireApiLogin, apiWebhooksController.remove);

// avatarUploadMiddleware (mounted on '/api/account/avatar' in src/app.js)
// runs before this router for that path - see its own comment for why it
// has to be mounted directly in app.js rather than chained here.
router.post('/api/account/avatar', requireApiLogin, apiProfileController.uploadAvatar);
router.delete('/api/account/avatar', requireApiLogin, apiProfileController.removeAvatar);

router.get('/api/admin/titles', requireApiAdmin, apiAdminController.listTitles);
router.post(
    '/api/admin/titles',
    requireApiAdmin,
    requireFgaPermission('can_create_title', () => 'platform:comics_tv', { tier: 'strict', admin: true, json: true }),
    apiAdminController.addMovie
);
router.post(
    '/api/admin/video-assets',
    requireApiAdmin,
    // Matches the fix already applied to the EJS route
    // (src/routes/adminRoutes.js) - can_publish_title, not just an admin
    // session, gates attaching a playable video asset.
    requireFgaPermission('can_publish_title', () => 'platform:comics_tv', { tier: 'strict', admin: true, json: true }),
    apiAdminController.uploadVideo
);

module.exports = router;
