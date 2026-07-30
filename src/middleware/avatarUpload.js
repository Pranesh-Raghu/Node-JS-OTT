'use strict';

const multer = require('multer');

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MiB

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function fileFilter(req, file, cb) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        cb(new Error('UNSUPPORTED_FILE_TYPE'));
        return;
    }
    cb(null, true);
}

// memoryStorage (not diskStorage): the uploaded bytes are stored directly in
// MySQL (users.avatar_image - see the avatar_image migration) rather than on
// local disk, since Render's web service filesystem is ephemeral and would
// silently drop uploaded files on the next deploy or restart.
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
    fileFilter,
});

// multer's own middleware calls next(err) on failure, which jumps straight
// to Express's error-handling chain rather than the next regular
// middleware - invoking it in callback form here lets a bad upload (wrong
// type, too large) redirect back to the form with a friendly message
// instead of hitting the generic 500 page.
//
// This is mounted directly in app.js, scoped to /account/profile, BEFORE
// the global CSRF middleware - not in the route file, and not chained after
// the CSRF check. The CSRF token lives in the multipart body alongside the
// file, and csrf-sync reads it from req.body._csrf; if multer hasn't parsed
// the body yet (which is the case for any multipart request reaching the
// global CSRF middleware, since express.json()/urlencoded() don't touch
// multipart bodies), req.body is undefined and CSRF validation fails for
// every single submission, not intermittently.
function avatarUploadMiddleware(req, res, next) {
    avatarUpload.single('avatar')(req, res, (err) => {
        if (!err) return next();
        const message = err.code === 'LIMIT_FILE_SIZE'
            ? 'That image is too large (max 3 MB).'
            : err.message === 'UNSUPPORTED_FILE_TYPE'
                ? 'Please upload a JPEG, PNG, WEBP, or GIF image.'
                : 'Upload failed. Please try again.';
        res.redirect(`/account/profile?error=${encodeURIComponent(message)}`);
    });
}

module.exports = { avatarUpload, avatarUploadMiddleware, ALLOWED_MIME_TYPES };
