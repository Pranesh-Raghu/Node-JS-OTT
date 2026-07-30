// Outbound webhook delivery worker. Deliberately not a general job queue /
// cron system -- just a function polled on a setInterval from src/index.js.
'use strict';

const { pool } = require('../db/pool');
const logger = require('../logger');
const { buildSignatureHeader } = require('./sign');

const MAX_ATTEMPTS = 8;
const MAX_CONSECUTIVE_FAILURES = 20;
const MAX_BACKOFF_MINUTES = 12 * 60;
const REQUEST_TIMEOUT_MS = 5000;
const BATCH_SIZE = 25;

async function deliverPendingWebhooks() {
    const [rows] = await pool.query(
        `SELECT d.id, d.endpoint_id, d.event_id, d.event_type, d.payload, d.attempts,
                e.url, e.secret, e.status AS endpoint_status
         FROM webhook_deliveries d
         JOIN webhook_endpoints e ON e.id = d.endpoint_id
         WHERE d.status IN ('pending', 'failed')
           AND d.next_attempt_at <= NOW()
           AND d.attempts < ?
         ORDER BY d.next_attempt_at ASC
         LIMIT ?`,
        [MAX_ATTEMPTS, BATCH_SIZE]
    );

    for (const row of rows) {
        if (row.endpoint_status !== 'enabled') {
            // Endpoint was disabled (manually, or by the failure circuit
            // breaker below) after this delivery was queued: stop retrying.
            await pool.execute(`UPDATE webhook_deliveries SET status = 'abandoned' WHERE id = ?`, [row.id]);
            continue;
        }
        try {
            await attemptDelivery(row);
        } catch (err) {
            logger.error({ err, deliveryId: row.id }, 'webhook delivery attempt threw unexpectedly');
        }
    }
}

async function attemptDelivery(row) {
    const rawBody = JSON.stringify(row.payload);
    const signature = buildSignatureHeader(row.secret, rawBody);
    const attempts = row.attempts + 1;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let success = false;
    let errorMessage = null;
    try {
        const response = await fetch(row.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CTV-Signature': signature,
                'User-Agent': 'ComicsTV-Webhooks/1.0',
            },
            body: rawBody,
            signal: controller.signal,
        });
        success = response.status >= 200 && response.status < 300;
        if (!success) errorMessage = `HTTP ${response.status}`;
    } catch (err) {
        errorMessage = err.name === 'AbortError' ? 'Request timed out' : err.message;
    } finally {
        clearTimeout(timeout);
    }

    if (success) {
        await pool.execute(
            `UPDATE webhook_deliveries SET status = 'delivered', attempts = ? WHERE id = ?`,
            [attempts, row.id]
        );
        await pool.execute(
            `UPDATE webhook_endpoints SET consecutive_failures = 0 WHERE id = ?`,
            [row.endpoint_id]
        );
        return;
    }

    const abandoned = attempts >= MAX_ATTEMPTS;
    await pool.execute(
        `UPDATE webhook_deliveries
         SET attempts = ?,
             status = ?,
             last_error = ?,
             next_attempt_at = LEAST(NOW() + (POWER(2, ?::numeric) * INTERVAL '1 minute'), NOW() + (?::numeric * INTERVAL '1 minute'))
         WHERE id = ?`,
        [attempts, abandoned ? 'abandoned' : 'failed', String(errorMessage).slice(0, 512), attempts, MAX_BACKOFF_MINUTES, row.id]
    );

    // Single atomic UPDATE rather than read-then-write: avoids a race where
    // two concurrent failures both read the same consecutive_failures value
    // and under-count, which would delay auto-disabling a dead endpoint.
    // CASE, not MySQL's IF() - Postgres has no IF() function.
    await pool.execute(
        `UPDATE webhook_endpoints
         SET consecutive_failures = consecutive_failures + 1,
             status = CASE WHEN consecutive_failures + 1 >= ? THEN 'disabled' ELSE status END
         WHERE id = ?`,
        [MAX_CONSECUTIVE_FAILURES, row.endpoint_id]
    );
}

module.exports = { deliverPendingWebhooks };
