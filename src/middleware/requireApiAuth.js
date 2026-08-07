// JSON-only auth guards for /api/*. Deliberately never redirect: a
// redirect from fetch() is followed transparently by the browser and the
// SPA would receive the login page's HTML back with a 200, not a 401 -
// client/src/lib/api.js relies on getting a real 401 to trigger its
// window.location.assign('/login?redirectTo=...') fallback.
function requireApiLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: 'unauthenticated', message: 'Login required' });
    }
    next();
}

function requireApiAdmin(req, res, next) {
    if (!req.session.admin) {
        return res.status(401).json({ error: 'admin_required', message: 'Admin login required' });
    }
    next();
}

module.exports = { requireApiLogin, requireApiAdmin };
