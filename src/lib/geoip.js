// Free, keyless IP geolocation (ip-api.com, ~45 req/min limit) with an
// in-memory cache so a returning device doesn't re-query on every request.
// Private/loopback addresses (all of local dev) can't be geolocated by any
// public service, so those short-circuit to a fixed label.
'use strict';

const cache = new Map(); // ip -> { label, expiresAt }
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function isPrivateOrLoopback(ip) {
    if (!ip) return true;
    if (ip === '::1' || ip === '127.0.0.1') return true;
    if (ip.startsWith('::ffff:127.') || ip.startsWith('::ffff:10.') || ip.startsWith('::ffff:192.168.')) return true;
    if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
    if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;
    return false;
}

async function lookupLocationLabel(ip) {
    if (isPrivateOrLoopback(ip)) return 'Local network';

    const cached = cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) return cached.label;

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,city,regionName,country`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.status !== 'success') return null;

        const label = [data.city, data.regionName, data.country].filter(Boolean).join(', ');
        cache.set(ip, { label, expiresAt: Date.now() + CACHE_TTL_MS });
        return label || null;
    } catch {
        return null; // geolocation is best-effort; never block device tracking on it
    }
}

module.exports = { lookupLocationLabel };
