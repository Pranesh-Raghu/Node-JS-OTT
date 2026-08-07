'use strict';

const watchlistRepo = require('../repositories/watchlistRepo');
const { getOrCreateAccountIdForUsername, getDefaultProfileIdForAccount } = require('../lib/accountLookup');

// Caps how many ids a single import request can carry - this is a one-time
// client-driven backfill from localStorage (see client/src/lib/
// watchlistMigration.js), not an ongoing bulk-write API, so there's no
// legitimate reason for it to be unbounded.
const MAX_IMPORT_IDS = 500;

async function resolveProfileId(username) {
    const accountId = await getOrCreateAccountIdForUsername(username);
    if (!accountId) return null;
    return getDefaultProfileIdForAccount(accountId);
}

async function listForUser(username) {
    const profileId = await resolveProfileId(username);
    if (!profileId) return [];
    return watchlistRepo.listByProfile(profileId);
}

async function addForUser(username, titleId) {
    const profileId = await resolveProfileId(username);
    if (!profileId) return { ok: false };
    const added = await watchlistRepo.add(profileId, titleId);
    return { ok: true, added };
}

async function removeForUser(username, titleId) {
    const profileId = await resolveProfileId(username);
    if (!profileId) return { ok: false };
    const removed = await watchlistRepo.remove(profileId, titleId);
    return { ok: removed };
}

// Only numeric-looking ids are forwarded to the DB - the import payload is
// client-supplied JSON (whatever happened to be in localStorage), so it's
// treated as untrusted input here, not just already-validated data.
async function importForUser(username, titleIds) {
    const profileId = await resolveProfileId(username);
    if (!profileId) return { imported: 0 };
    const numericIds = (Array.isArray(titleIds) ? titleIds : [])
        .map((id) => String(id))
        .filter((id) => /^\d+$/.test(id))
        .slice(0, MAX_IMPORT_IDS);
    if (numericIds.length === 0) return { imported: 0 };
    const imported = await watchlistRepo.addMany(profileId, numericIds);
    return { imported };
}

module.exports = { listForUser, addForUser, removeForUser, importForUser };
