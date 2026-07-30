const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { DCR_ALLOWED_SCOPES } = require('./scopes');

// --- CIMD fetcher (simplified) ---
// Per the "move fast" directive this does basic hostname/scheme validation
// and a bounded, non-redirecting fetch, but skips the full undici custom-
// connector SSRF hardening (peer-address checking against a DNS-rebinding
// attack) from the full design. Flagged, not silently dropped: do not treat
// this as production-hardened against a hostile client_id URL.
const net = require('net');
const dns = require('dns').promises;

function isPrivateIp(ip) {
    if (net.isIP(ip) === 4) {
        const parts = ip.split('.').map(Number);
        if (parts[0] === 127 || parts[0] === 10 || parts[0] === 0) return true;
        if (parts[0] === 169 && parts[1] === 254) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        return false;
    }
    if (net.isIP(ip) === 6) {
        return ip === '::1' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80');
    }
    return false;
}

async function validateAndResolveClientIdUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }
    if (url.protocol !== 'https:') return null;
    if (url.username || url.password || url.hash) return null;
    if (/(^|\/)\.\.?(\/|$)/.test(url.pathname)) return null;

    let addresses;
    try {
        addresses = await dns.lookup(url.hostname, { all: true });
    } catch {
        return null;
    }
    if (addresses.some((a) => isPrivateIp(a.address))) return null;
    return url;
}

async function fetchCimdDocument(clientIdUrl) {
    const url = await validateAndResolveClientIdUrl(clientIdUrl);
    if (!url) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    try {
        const res = await fetch(url, { redirect: 'manual', signal: controller.signal });
        clearTimeout(timeout);
        if (res.status !== 200) return null;
        const contentLength = Number(res.headers.get('content-length') || 0);
        if (contentLength > 5120) return null;
        const text = await res.text();
        if (text.length > 5120) return null;
        const doc = JSON.parse(text);
        if (doc.client_id !== clientIdUrl) return null;
        return doc;
    } catch {
        clearTimeout(timeout);
        return null;
    }
}

// --- Client lookup ---

async function findClient(clientId) {
    if (clientId.startsWith('https://')) {
        const doc = await fetchCimdDocument(clientId);
        if (!doc) return null;
        return {
            clientId,
            clientName: doc.client_name || clientId,
            redirectUris: Array.isArray(doc.redirect_uris) ? doc.redirect_uris : [],
            grantTypes: Array.isArray(doc.grant_types) ? doc.grant_types : ['authorization_code'],
            scope: typeof doc.scope === 'string' ? doc.scope : 'catalog:read',
            kind: 'cimd',
        };
    }

    const [rows] = await pool.execute('SELECT * FROM oauth_clients WHERE client_id = ?', [clientId]);
    if (rows.length === 0) return null;
    const row = rows[0];
    return {
        clientId: row.client_id.toString(), // VARBINARY -> Buffer from mysql2
        clientName: row.client_name,
        redirectUris: row.redirect_uris, // mysql2 auto-parses JSON columns
        grantTypes: row.grant_types,
        scope: row.scope,
        kind: row.kind,
    };
}

function isValidDcrRedirectUri(uri) {
    let url;
    try {
        url = new URL(uri);
    } catch {
        return false;
    }
    if (url.hash) return false;
    if (url.protocol === 'https:') return true;
    if (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.hostname === 'localhost')) {
        return true;
    }
    return false;
}

async function registerClient({ clientName, redirectUris, grantTypes, scope }) {
    if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > 5) {
        throw Object.assign(new Error('invalid_redirect_uri'), { oauthError: 'invalid_redirect_uri' });
    }
    if (!redirectUris.every(isValidDcrRedirectUri)) {
        throw Object.assign(new Error('invalid_redirect_uri'), { oauthError: 'invalid_redirect_uri' });
    }
    const allowedGrants = ['authorization_code', 'refresh_token'];
    const finalGrants = (grantTypes || ['authorization_code']).filter((g) => allowedGrants.includes(g));
    if (finalGrants.length === 0) {
        throw Object.assign(new Error('invalid_client_metadata'), { oauthError: 'invalid_client_metadata' });
    }
    const requestedScopes = (scope || 'catalog:read').split(' ').filter((s) => DCR_ALLOWED_SCOPES.has(s));
    const finalScope = requestedScopes.length > 0 ? requestedScopes.join(' ') : 'catalog:read';

    const clientId = `dcr_${crypto.randomBytes(16).toString('base64url')}`;
    const registrationAccessToken = crypto.randomBytes(32).toString('base64url');
    const ratHash = crypto.createHash('sha256').update(registrationAccessToken).digest();

    await pool.execute(
        `INSERT INTO oauth_clients
           (client_id, client_name, kind, redirect_uris, token_endpoint_auth_method, grant_types, scope, registration_access_token_hash)
         VALUES (?, ?, 'dcr', ?, 'none', ?, ?, ?)`,
        [clientId, (clientName || 'Unnamed client').slice(0, 128), JSON.stringify(redirectUris), JSON.stringify(finalGrants), finalScope, ratHash]
    );

    return {
        client_id: clientId,
        client_name: clientName || 'Unnamed client',
        redirect_uris: redirectUris,
        grant_types: finalGrants,
        token_endpoint_auth_method: 'none',
        scope: finalScope,
        registration_access_token: registrationAccessToken,
    };
}

module.exports = { findClient, registerClient };
