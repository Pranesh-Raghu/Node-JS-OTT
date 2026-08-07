const { csrfSync } = require('csrf-sync');

const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'],
    // OAuth token/registration/MCP endpoints are machine-to-machine or
    // pre-session; they authenticate via bearer tokens/client credentials,
    // not the session-bound CSRF token. `/api/*` is deliberately NOT
    // exempt: those are session-cookie-authenticated browser requests (the
    // React SPA), so they need the same CSRF protection as a form post.
    // csrf-sync already skips GET/HEAD/OPTIONS by default, which is why
    // GET /api/search and GET /api/session need no token.
    skipCsrfProtection: (req) =>
        req.path === '/oauth/token' ||
        req.path === '/oauth/register' ||
        req.path.startsWith('/mcp'),
});

function attachCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

module.exports = { csrfSynchronisedProtection, attachCsrfToken };
