'use strict';

const sessionDeviceRepo = require('../repositories/sessionDeviceRepo');
const { getOrCreateAccountIdForUsername } = require('../lib/accountLookup');

async function listSessionsForUser(username, currentSessionId) {
    const accountId = await getOrCreateAccountIdForUsername(username);
    if (!accountId) return [];

    const rows = await sessionDeviceRepo.listByAccount(accountId);
    return rows.map((row) => ({
        sessionId: row.session_id,
        label: row.label || 'Unknown device',
        locationLabel: row.location_label || 'Unknown location',
        userAgent: row.user_agent,
        firstSeenAt: row.first_seen_at,
        lastSeenAt: row.last_seen_at,
        isCurrent: row.session_id === currentSessionId,
    }));
}

async function revokeOne(username, sessionId) {
    const accountId = await getOrCreateAccountIdForUsername(username);
    if (!accountId) return { ok: false, error: 'not_found' };

    const device = await sessionDeviceRepo.findBySessionId(sessionId);
    if (!device || Number(device.account_id) !== Number(accountId)) {
        return { ok: false, error: 'not_found' };
    }

    await sessionDeviceRepo.revokeSession(sessionId);
    return { ok: true };
}

async function revokeAll(username) {
    const accountId = await getOrCreateAccountIdForUsername(username);
    if (!accountId) return [];
    return sessionDeviceRepo.revokeAllForAccount(accountId);
}

module.exports = { listSessionsForUser, revokeOne, revokeAll };
