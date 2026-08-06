const express = require('express');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const { requireAdminLogin } = require('../middleware/requireLogin');
const { requireFgaPermission } = require('../authz/middleware');

const router = express.Router();

router.get('/login', authController.showAdminLogin);
router.post('/login', authController.handleAdminLogin);
router.get('/logout', authController.handleAdminLogout);
router.get('/', requireAdminLogin, adminController.showAdmin);
router.post(
    '/add-movie',
    requireAdminLogin,
    requireFgaPermission('can_create_title', () => 'platform:comics_tv', { tier: 'strict', admin: true }),
    adminController.addMovie
);
router.post(
    '/upload-video',
    requireAdminLogin,
    // Was missing the OpenFGA check that every other admin write path has -
    // an admin session alone let anyone attach a playable video asset to a
    // title with no fine-grained permission check. `can_publish_title`
    // matches this action's semantics (it's what makes a title playable).
    requireFgaPermission('can_publish_title', () => 'platform:comics_tv', { tier: 'strict', admin: true }),
    adminController.uploadVideo
);

module.exports = router;
