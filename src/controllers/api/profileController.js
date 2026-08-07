'use strict';

const authService = require('../../services/authService');

// No GET /api/account/profile - GET /api/session (src/controllers/api/
// sessionController.js) already carries user/email/avatarUrl/avatarInitial/
// avatarColor/gravatarUrl, and Profile.jsx reads that via SessionContext
// rather than re-fetching the same fields from a second endpoint.

// avatarUploadMiddleware (mounted on this path in src/app.js, see its own
// comment) has already run multer by the time this fires - req.file is
// populated the same way it is for the EJS form's POST /account/profile.
async function uploadAvatar(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'no_file', message: 'Choose an image file first.' });
        }
        const result = await authService.setUploadedAvatar(req.session.user, req.file.buffer, req.file.mimetype);
        req.session.avatarUrl = result.avatarUrl;
        res.json({ avatarUrl: result.avatarUrl });
    } catch (err) {
        next(err);
    }
}

async function removeAvatar(req, res, next) {
    try {
        const result = await authService.clearAvatar(req.session.user);
        req.session.avatarUrl = result.avatarUrl;
        res.json({ avatarUrl: result.avatarUrl });
    } catch (err) {
        next(err);
    }
}

module.exports = { uploadAvatar, removeAvatar };
