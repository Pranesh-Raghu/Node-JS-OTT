function readThemeCookie(req) {
    const header = req.headers.cookie;
    if (!header) return 'dark';
    const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith('theme='));
    const value = match ? decodeURIComponent(match.slice('theme='.length)) : null;
    return value === 'light' ? 'light' : 'dark';
}

// avatarInitial/avatarColor/gravatarUrl used to be attached here as
// FUNCTION helpers for views/partials/avatar.ejs to call at render time.
// That partial (and its only two callers, home.ejs and account/
// profile.ejs) is gone now that those pages are React - GET /api/session
// (src/controllers/api/sessionController.js) pre-resolves the same three
// values into the JSON payload instead, using src/lib/avatar.js directly,
// which stays the single source of truth for the palette/Gravatar hash.
function attachViewHelpers(req, res, next) {
    res.locals.theme = readThemeCookie(req);
    next();
}

module.exports = { attachViewHelpers };
