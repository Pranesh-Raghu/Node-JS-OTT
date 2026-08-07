'use strict';

const { avatarInitial, avatarColor, gravatarUrl } = require('../../lib/avatar');
const sessionDeviceService = require('../../services/sessionDeviceService');

// Always 200, even for an anonymous visitor (user: null) - the SPA needs
// the CSRF token and theme regardless of login state, and this avoids
// every page having to special-case "session not loaded yet" vs
// "definitely logged out". Replaces the `res.locals` FUNCTION helpers
// (avatarInitial/avatarColor/gravatarUrl, src/middleware/locals.js) that
// views/partials/avatar.ejs used to call at render time - pre-resolving
// them here keeps src/lib/avatar.js as the single source of truth and
// avoids shipping an md5 implementation to the browser just to compute a
// Gravatar URL client-side.
async function getSession(req, res, next) {
    try {
        const user = req.session.user || null;
        let deviceCount = 0;
        if (user) {
            const sessions = await sessionDeviceService.listSessionsForUser(user, req.sessionID);
            deviceCount = sessions.length;
        }

        res.set('Cache-Control', 'no-store');
        res.json({
            user,
            email: req.session.email || null,
            avatarUrl: req.session.avatarUrl || null,
            avatarInitial: user ? avatarInitial(user) : null,
            avatarColor: user ? avatarColor(user) : null,
            gravatarUrl: user && req.session.email ? gravatarUrl(req.session.email) : null,
            deviceCount,
            isAdmin: Boolean(req.session.admin),
            theme: res.locals.theme,
            csrfToken: res.locals.csrfToken,
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { getSession };
