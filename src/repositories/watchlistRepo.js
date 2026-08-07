'use strict';

const { pool } = require('../db/pool');

// watchlist_items already existed in the schema (migration 0001, the
// Phase 3 rewrite) but was never wired up to any repo/service/controller -
// keyed on profile_id (not account_id), for the multi-profile model the
// `profiles` table anticipates, with a composite (profile_id, title_id)
// primary key and no surrogate id column. src/lib/accountLookup.js's
// getDefaultProfileIdForAccount() resolves which profile_id to use, since
// every account currently has exactly one (its 'Default' profile).
//
// Filters to published, non-deleted titles on read - a title that's since
// been unpublished or deleted just silently drops off the list, rather
// than showing broken/stale data the way the old DOM-scraped localStorage
// model could. Shape matches what the old localStorage objects looked like
// ({id, title, poster}), so the React watchlist page is a straight port.
async function listByProfile(profileId) {
    const [rows] = await pool.execute(
        `SELECT t.id, t.title, t.poster_url
         FROM watchlist_items w
         JOIN titles t ON t.id = w.title_id
         WHERE w.profile_id = ? AND t.status = 'published' AND t.deleted_at IS NULL
         ORDER BY w.added_at DESC`,
        [profileId]
    );
    return rows.map((r) => ({ id: String(r.id), title: r.title, poster: r.poster_url }));
}

// INSERT...SELECT (not a plain INSERT VALUES) so a nonexistent or
// unpublished title_id - the request body is client-supplied, not
// pre-validated - silently inserts zero rows instead of throwing a
// fk_wl_title violation. ON CONFLICT DO NOTHING targets the table's
// (profile_id, title_id) primary key, the Postgres equivalent of MySQL's
// INSERT IGNORE - makes both this and addMany below idempotent (needed for
// the one-time localStorage import, which may be retried after a partial
// failure). RETURNING title_id comes back empty on either a no-op
// conflict OR a title that didn't qualify - the caller can't tell those
// apart from this alone, but both cases mean "still not newly added",
// which is all the toast decision in the controller needs.
async function add(profileId, titleId) {
    const [rows] = await pool.execute(
        `INSERT INTO watchlist_items (profile_id, title_id)
         SELECT ?, id FROM titles WHERE id = ? AND status = 'published' AND deleted_at IS NULL
         ON CONFLICT (profile_id, title_id) DO NOTHING
         RETURNING title_id`,
        [profileId, titleId]
    );
    return rows.length > 0;
}

async function remove(profileId, titleId) {
    const [rows] = await pool.execute('DELETE FROM watchlist_items WHERE profile_id = ? AND title_id = ?', [profileId, titleId]);
    return rows.affectedRows > 0;
}

// Bulk variant for the localStorage import (client/src/lib/watchlistMigration.js).
// `= ANY(?)` with a JS array, not `IN (?)` - see the comment in
// sessionDeviceRepo.revokeAllForAccount for why (pg auto-converts a bound
// array to a Postgres array; there's no mysql2-style auto-expanding `?`).
async function addMany(profileId, titleIds) {
    if (titleIds.length === 0) return 0;
    const [rows] = await pool.query(
        `INSERT INTO watchlist_items (profile_id, title_id)
         SELECT ?, id FROM titles WHERE id = ANY(?) AND status = 'published' AND deleted_at IS NULL
         ON CONFLICT (profile_id, title_id) DO NOTHING`,
        [profileId, titleIds]
    );
    return rows.affectedRows;
}

module.exports = { listByProfile, add, remove, addMany };
