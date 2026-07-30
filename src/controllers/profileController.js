'use strict';

const authService = require('../services/authService');
const userRepo = require('../repositories/userRepo');

async function showProfile(req, res) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent('/account/profile')}`);
    }
    res.render('account/profile', {
        user: req.session.user,
        email: req.session.email,
        avatarUrl: req.session.avatarUrl,
        message: req.query.message || null,
        error: req.query.error || null,
    });
}

async function updateProfile(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        if (req.body?.removeAvatar) {
            const result = await authService.clearAvatar(req.session.user);
            req.session.avatarUrl = result.avatarUrl;
            return res.redirect(`/account/profile?message=${encodeURIComponent('Profile picture removed.')}`);
        }

        if (!req.file) {
            return res.redirect(`/account/profile?error=${encodeURIComponent('Choose an image file first.')}`);
        }

        const result = await authService.setUploadedAvatar(req.session.user, req.file.buffer, req.file.mimetype);
        req.session.avatarUrl = result.avatarUrl;
        res.redirect(`/account/profile?message=${encodeURIComponent('Profile picture updated.')}`);
    } catch (err) {
        next(err);
    }
}

// Public (no login required) - matches Gravatar/Google avatar URLs, which
// are also unauthenticated image links. Username is only used to look up
// which row's bytes to stream, never anything more privileged than that.
async function serveAvatar(req, res, next) {
    try {
        const row = await userRepo.getAvatarImage(req.params.username);
        if (!row || !row.avatar_image) return res.status(404).end();
        res.set('Content-Type', row.avatar_mime || 'application/octet-stream');
        res.set('Cache-Control', 'private, max-age=3600');
        res.send(row.avatar_image);
    } catch (err) {
        next(err);
    }
}

module.exports = { showProfile, updateProfile, serveAvatar };
