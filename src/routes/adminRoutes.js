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
router.post('/upload-video', requireAdminLogin, adminController.uploadVideo);

module.exports = router;
