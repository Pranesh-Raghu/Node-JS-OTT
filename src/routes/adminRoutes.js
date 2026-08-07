const express = require('express');
const authController = require('../controllers/authController');
const { requireAdminLogin } = require('../middleware/requireLogin');
const { serveSpa } = require('../lib/serveSpa');

const router = express.Router();

router.get('/login', authController.showAdminLogin);
router.post('/login', authController.handleAdminLogin);
router.get('/logout', authController.handleAdminLogout);
// Migrated to React - requireAdminLogin stays on the shell route itself
// (see the migration plan: an unauthenticated visitor must still get a
// redirect to /admin/login, not a rendered admin UI skeleton that just
// fails its API calls). add-movie/upload-video moved to
// src/routes/apiRoutes.js, with the same two guards
// (requireAdminLogin's JSON equivalent + both FGA relations) intact.
router.get('/', requireAdminLogin, serveSpa);

module.exports = router;
