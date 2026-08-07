// Outbound webhook delivery worker. Deliberately not a general job queue /
// cron system -- just a function polled on a setInterval from src/index.js.
'use strict';

const http = require('http');
const https = require('https');
const { pool } = require('../db/pool');
const logger = require('../logger');
const { buildSignatureHeader } = require('./sign');
const { resolveDeliveryAddress } = require('./urlSafety');

const MAX_ATTEMPTS = 8;
const MAX_CONSECUTIVE_FAILURES = 20;
const MAX_BACKOFF_MINUTES = 12 * 60;
const REQUEST_TIMEOUT_MS = 5000;
const BATCH_SIZE = 25;

// Security fix: this used to be a plain `fetch(row.url, ...)`, which lets
// Node's own DNS resolution decide where to connect at delivery time - see
// the comment on resolveDeliveryAddress() in urlSafety.js for why that's
// exploitable (validateWebhookUrl only checked once, at creation). This
// re-resolves right before the request and connects to that exact pinned
// address, the same pattern used for the OAuth CIMD fetch in
// src/auth/oidc/clients.js. `servername` keeps TLS certificate verification
// checking against the real hostname.
function sendSignedWebhookRequest(url, resolved, { headers, body, timeoutMs }) {
    return new Promise((resolve, reject) => {
        const transport = url.protocol === 'https:' ? https : http;
        const requestOptions = {
            method: 'POST',
            host: resolved.address,
            family: resolved.family,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: `${url.pathname}${url.search}`,
            headers: { ...headers, Host: url.host },
            timeout: timeoutMs,
        };
        if (url.protocol === 'https:') {
            requestOptions.servername = url.hostname;
        }

        const req = transport.request(requestOptions, (res) => {
            res.resume(); // drain the body - only the status code matters here
            resolve({ statusCode: res.statusCode });
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Request timed out')));
        req.end(body);
    });
}

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

    let success = false;
    let errorMessage = null;
    try {
        const url = new URL(row.url);
        const resolved = await resolveDeliveryAddress(url);
        if (!resolved) {
            // The endpoint now resolves to a private/reserved address (or
            // doesn't resolve at all) - refuse to connect. Counted as a
            // normal delivery failure so the existing backoff/circuit
            // breaker below eventually disables the endpoint, same as any
            // other unreachable target.
            throw new Error('Endpoint no longer resolves to a public address');
        }

        const response = await sendSignedWebhookRequest(url, resolved, {
            headers: {
                'Content-Type': 'application/json',
                'X-CTV-Signature': signature,
                'User-Agent': 'ComicsTV-Webhooks/1.0',
            },
            body: rawBody,
            timeoutMs: REQUEST_TIMEOUT_MS,
        });
        success = response.statusCode >= 200 && response.statusCode < 300;
        if (!success) errorMessage = `HTTP ${response.statusCode}`;
    } catch (err) {
        errorMessage = err.message;
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
