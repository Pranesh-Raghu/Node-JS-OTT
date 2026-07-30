'use strict';

const { pool, withTransaction } = require('../db/pool');

async function listByAccount(accountId) {
    const [rows] = await pool.execute(
        `SELECT session_id, user_agent, label, location_label, first_seen_at, last_seen_at
         FROM session_devices
         WHERE account_id = ?
         ORDER BY last_seen_at DESC`,
        [accountId]
    );
    return rows;
}

async function findBySessionId(sessionId) {
    const [rows] = await pool.execute(
        'SELECT session_id, account_id FROM session_devices WHERE session_id = ?',
        [sessionId]
    );
    return rows[0] || null;
}

// Deletes the device record and the connect-pg-simple session row for one
// session id, in a transaction. Revocation must be all-or-nothing: this app
// otherwise reads the `sessions` table on every request to decide whether a
// cookie is still valid, so a partial write here could either leave a
// device "logged in" while hidden from the UI, or vice versa.
async function revokeSession(sessionId) {
    await withTransaction(async (conn) => {
        await conn.execute('DELETE FROM session_devices WHERE session_id = ?', [sessionId]);
        // connect-pg-simple's session table uses `sid` as its primary key
        // column, not `session_id` (which was express-mysql-session's name
        // for the equivalent column).
        await conn.execute('DELETE FROM sessions WHERE sid = ?', [sessionId]);
    });
}

async function revokeAllForAccount(accountId) {
    const [rows] = await pool.execute(
        'SELECT session_id FROM session_devices WHERE account_id = ?',
        [accountId]
    );
    const sessionIds = rows.map((r) => r.session_id);
    if (sessionIds.length === 0) return sessionIds;

    await withTransaction(async (conn) => {
        await conn.execute('DELETE FROM session_devices WHERE account_id = ?', [accountId]);
        // = ANY(?) with a JS array parameter, not IN (?) - mysql2 let a
        // single `?` auto-expand to `IN (?, ?, ?)` when bound to an array;
        // pg has no equivalent, but does auto-convert a bound JS array into
        // a Postgres array, which ANY() can then test membership against.
        await conn.query('DELETE FROM sessions WHERE sid = ANY(?)', [sessionIds]);
    });
    return sessionIds;
}

// Best-effort cleanup used on normal logout, where the current session is
// already being destroyed by express-session itself -- this just prevents
// an orphaned session_devices row (there's no FK to `sessions` to cascade
// this automatically, see the migration's comment).
async function deleteBySessionId(sessionId) {
    await pool.execute('DELETE FROM session_devices WHERE session_id = ?', [sessionId]);
}

module.exports = {
    listByAccount,
    findBySessionId,
    revokeSession,
    revokeAllForAccount,
    deleteBySessionId,
};
