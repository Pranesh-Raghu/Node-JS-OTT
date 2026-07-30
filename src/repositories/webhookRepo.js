'use strict';

const crypto = require('crypto');
const { ulid } = require('ulid');
const { pool } = require('../db/pool');

async function createEndpoint({ accountId, url, eventTypes }) {
    const secret = crypto.randomBytes(32);
    const [rows] = await pool.execute(
        `INSERT INTO webhook_endpoints (account_id, url, secret, event_types)
         VALUES (?, ?, ?, ?) RETURNING id`,
        [accountId, url, secret, JSON.stringify(eventTypes)]
    );
    return { id: rows[0].id, secret };
}

async function listByAccount(accountId) {
    const [rows] = await pool.execute(
        `SELECT id, url, event_types, status, created_at, consecutive_failures
         FROM webhook_endpoints
         WHERE account_id = ?
         ORDER BY created_at DESC`,
        [accountId]
    );
    return rows;
}

async function findByIdForAccount(id, accountId) {
    const [rows] = await pool.execute(
        `SELECT id, account_id, url, status FROM webhook_endpoints WHERE id = ? AND account_id = ?`,
        [id, accountId]
    );
    return rows[0] || null;
}

async function setStatus(id, accountId, status) {
    await pool.execute(
        `UPDATE webhook_endpoints SET status = ? WHERE id = ? AND account_id = ?`,
        [status, id, accountId]
    );
}

async function deleteEndpoint(id, accountId) {
    await pool.execute('DELETE FROM webhook_endpoints WHERE id = ? AND account_id = ?', [id, accountId]);
}

async function listRecentDeliveries(endpointId, limit = 5) {
    const [rows] = await pool.query(
        `SELECT event_id, event_type, status, attempts, next_attempt_at, last_error, created_at
         FROM webhook_deliveries
         WHERE endpoint_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
        [endpointId, limit]
    );
    return rows;
}

// Enqueues one webhook_deliveries row per enabled endpoint subscribed to
// `eventType`. Must be called with an in-transaction connection (not the
// pool) so the enqueue commits atomically with whatever write produced the
// event -- see titleRepo.createTitle, which is the only current caller.
// `buildPayload(eventId)` lets the caller stamp each delivery with its own
// event_id without this function reaching into ulid-generation concerns of
// its own event modeling.
async function enqueueForEvent(conn, { eventType, buildPayload }) {
    // `@>` is JSONB containment: this checks whether eventType (as a bare
    // JSON string) is an element of the event_types array column - the
    // Postgres equivalent of MySQL's JSON_CONTAINS(). Not `?`/`?|` (the
    // JSONB "key exists" operators) - those are literal `?` characters that
    // would collide with this codebase's own `?` placeholder convention
    // (see src/db/pool.js's shim).
    const [endpoints] = await conn.query(
        `SELECT id FROM webhook_endpoints WHERE status = 'enabled' AND event_types @> ?::jsonb`,
        [JSON.stringify(eventType)]
    );

    for (const endpoint of endpoints) {
        const eventId = ulid();
        const payload = buildPayload(eventId);
        await conn.execute(
            `INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, payload, next_attempt_at)
             VALUES (?, ?, ?, ?, NOW())`,
            [endpoint.id, eventId, eventType, JSON.stringify(payload)]
        );
    }
}

module.exports = {
    createEndpoint,
    listByAccount,
    findByIdForAccount,
    setStatus,
    deleteEndpoint,
    listRecentDeliveries,
    enqueueForEvent,
};
