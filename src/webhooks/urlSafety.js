// Basic SSRF guard for webhook endpoint URLs supplied by a logged-in user --
// this server will make outbound POST requests to whatever URL is stored
// here, so an unvalidated URL lets a user probe internal network services.
//
// `isPrivateIp` mirrors the function of the same name in
// src/auth/oidc/clients.js (the parallel OIDC/CIMD track). That function
// isn't exported there, and that file is explicitly out of bounds for this
// change, so this is a small independent copy rather than a cross-module
// import. Keep the two in sync by hand if either changes.
'use strict';

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

// https:// is required in general. http:// is allowed only to
// localhost/127.0.0.1 so a developer can point a webhook at something
// running locally while testing (this app has no SSRF-hardened fetcher like
// the OAuth/CIMD track's undici custom connector -- this is the same
// "move fast" trade-off documented there: basic hostname/scheme + DNS
// resolution check, not hardened against DNS-rebinding attacks).
async function validateWebhookUrl(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return { ok: false, error: 'Enter a valid URL.' };
    }

    if (url.username || url.password) {
        return { ok: false, error: 'URL must not contain credentials.' };
    }

    const isLocalHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol !== 'https:' && !isLocalHttp) {
        return { ok: false, error: 'URL must use https:// (or http:// to localhost for local testing).' };
    }

    if (!isLocalHttp) {
        let addresses;
        try {
            addresses = await dns.lookup(url.hostname, { all: true });
        } catch {
            return { ok: false, error: 'Could not resolve that host.' };
        }
        if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
            return { ok: false, error: 'URL resolves to a private or reserved address.' };
        }
    }

    return { ok: true, url };
}

module.exports = { validateWebhookUrl, isPrivateIp };
