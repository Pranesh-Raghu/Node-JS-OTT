'use strict';

const userRepo = require('../repositories/userRepo');

// showProfile/updateProfile were retired when /account/profile moved to
// React (see src/controllers/api/profileController.js for the avatar
// upload/remove equivalents, and src/routes/accountRoutes.js for the
// route swap).

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

module.exports = { serveAvatar };
