const { verifyAccessToken } = require('./oidc/keys');
const { verifyApiKey } = require('./api-keys');

const RESOURCE_ID = process.env.MCP_RESOURCE_ID || 'http://localhost:1000/mcp';

// Resolves exactly one credential chain, no fall-through between them.
// Session cookies are never accepted here - not because express-session
// isn't applied (it's mounted globally in src/app.js and IS parsed on
// every request, /mcp included; this comment used to claim otherwise),
// but because this middleware only checks the Authorization header and
// never consults req.session at all. The session-cookie-authenticated
// React SPA talks to /api/* instead, guarded by
// src/middleware/requireApiAuth.js, which is a separate code path from
// this one - this middleware is mounted only on /mcp (src/mcp/server.js).
async function requireBearerAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        res.set('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource/mcp"`);
        return res.status(401).json({ error: 'invalid_token', error_description: 'Missing bearer token' });
    }
    const token = authHeader.slice('Bearer '.length).trim();

    if (token.startsWith('ctv_live_')) {
        const result = await verifyApiKey(token);
        if (!result) {
            res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
            return res.status(401).json({ error: 'invalid_token' });
        }
        req.auth = { type: 'apikey', subject: `user:${result.accountId}`, scopes: new Set(result.scope.split(' ')) };
        return next();
    }

    try {
        const payload = await verifyAccessToken(token, { audience: RESOURCE_ID });
        req.auth = {
            type: 'jwt',
            subject: payload.sub,
            clientId: payload.client_id,
            scopes: new Set((payload.scope || '').split(' ').filter(Boolean)),
        };
        return next();
    } catch {
        res.set('WWW-Authenticate', `Bearer error="invalid_token", resource_metadata="${req.protocol}://${req.get('host')}/.well-known/oauth-protected-resource/mcp"`);
        return res.status(401).json({ error: 'invalid_token', error_description: 'Token invalid, expired, or wrong audience' });
    }
}

function requireScope(scope) {
    return (req, res, next) => {
        if (!req.auth?.scopes?.has(scope)) {
            res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`);
            return res.status(403).json({ error: 'insufficient_scope', error_description: `Required scope: ${scope}` });
        }
        next();
    };
}

module.exports = { requireBearerAuth, requireScope };
