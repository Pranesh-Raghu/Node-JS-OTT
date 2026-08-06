const crypto = require('crypto');
const { pool } = require('../../db/pool');
const { DCR_ALLOWED_SCOPES } = require('./scopes');

// --- CIMD fetcher (simplified) ---
// Per the "move fast" directive this does basic hostname/scheme validation
// and a bounded, non-redirecting fetch. It resolves and validates the
// hostname once in validateAndResolveClientIdUrl(), then fetchCimdDocument()
// connects to that exact pinned address instead of letting fetch() re-
// resolve the hostname itself - closing the DNS-rebinding TOCTOU window a
// plain two-step "check DNS, then fetch(url)" would have (an attacker's DNS
// server could answer the check with a public IP and the real connection
// with an internal one). TLS still validates the certificate against the
// original hostname via `servername`, so this isn't a cert-pinning bypass.
const net = require('net');
const https = require('https');
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
    if (addresses.length === 0) return null;
    if (addresses.some((a) => isPrivateIp(a.address))) return null;
    // Pin to the address just validated - fetchCimdDocument() must connect
    // to this exact IP, not re-resolve url.hostname.
    return { url, address: addresses[0].address, family: addresses[0].family };
}

async function fetchCimdDocument(clientIdUrl) {
    const resolved = await validateAndResolveClientIdUrl(clientIdUrl);
    if (!resolved) return null;
    const { url, address, family } = resolved;

    try {
        const res = await new Promise((resolve, reject) => {
            const req = https.request(
                {
                    // Connect straight to the pinned, already-validated
                    // address. `servername` keeps SNI and certificate
                    // verification checking against the real hostname, so a
                    // valid cert for url.hostname is still required.
                    host: address,
                    family,
                    port: url.port || 443,
                    path: `${url.pathname}${url.search}`,
                    servername: url.hostname,
                    headers: { Host: url.hostname },
                    timeout: 2500,
                },
                resolve
            );
            req.on('error', reject);
            req.on('timeout', () => req.destroy(new Error('CIMD fetch timed out')));
            req.end();
        });

        if (res.statusCode !== 200) {
            res.resume();
            return null;
        }
        const contentLength = Number(res.headers['content-length'] || 0);
        if (contentLength > 5120) {
            res.resume();
            return null;
        }

        let text = '';
        let tooLarge = false;
        for await (const chunk of res) {
            text += chunk;
            if (text.length > 5120) {
                tooLarge = true;
                break;
            }
        }
        res.destroy();
        if (tooLarge) return null;

        const doc = JSON.parse(text);
        if (doc.client_id !== clientIdUrl) return null;
        return doc;
    } catch {
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
