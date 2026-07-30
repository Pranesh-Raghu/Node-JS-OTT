const express = require('express');
const sessionsController = require('../controllers/sessionsController');
const webhooksController = require('../controllers/webhooksController');
const profileController = require('../controllers/profileController');

const router = express.Router();

router.get('/account/profile', profileController.showProfile);
router.post('/account/profile', profileController.updateProfile);
router.get('/account/avatar/:username', profileController.serveAvatar);

router.get('/account/sessions', sessionsController.listSessions);
router.post('/account/sessions/:sessionId/revoke', sessionsController.revokeSession);
router.post('/account/sessions/revoke-all', sessionsController.revokeAllSessions);

router.get('/account/webhooks', webhooksController.listWebhooks);
router.post('/account/webhooks', webhooksController.createWebhook);
router.post('/account/webhooks/:id/toggle', webhooksController.toggleWebhook);
router.post('/account/webhooks/:id/delete', webhooksController.deleteWebhook);

module.exports = router;
