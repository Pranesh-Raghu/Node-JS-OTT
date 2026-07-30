const express = require('express');
const authController = require('../controllers/authController');

const router = express.Router();

router.get('/login', authController.showLogin);
router.post('/login', authController.handleLogin);
router.get('/signup', authController.showSignup);
router.post('/signup', authController.handleSignup);
router.get('/logout', authController.handleLogout);
router.get('/auth/google', authController.startGoogleLogin);
router.get('/auth/google/callback', authController.handleGoogleCallback);

module.exports = router;
