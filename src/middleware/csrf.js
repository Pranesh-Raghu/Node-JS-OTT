const { csrfSync } = require('csrf-sync');

const { csrfSynchronisedProtection, generateToken } = csrfSync({
    getTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token'],
    // OAuth token/registration/MCP endpoints are machine-to-machine or
    // pre-session; they authenticate via bearer tokens/client credentials,
    // not the session-bound CSRF token.
    skipCsrfProtection: (req) =>
        req.path === '/oauth/token' ||
        req.path === '/oauth/register' ||
        req.path.startsWith('/api/') ||
        req.path.startsWith('/mcp'),
});

function attachCsrfToken(req, res, next) {
    res.locals.csrfToken = generateToken(req);
    next();
}

module.exports = { csrfSynchronisedProtection, attachCsrfToken };
