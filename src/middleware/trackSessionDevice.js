// Upserts a session_devices row for every authenticated request so the
// account's "My sessions" page can show active devices.
//
// Simplification: no in-memory last-write throttle map. `ON DUPLICATE KEY
// UPDATE` against a single-row primary-key lookup is cheap at this app's
// scale, and a throttle map adds its own bookkeeping (periodic cleanup of
// entries for sessions that never revisit) for little benefit here. If this
// table ever sees write-contention problems, add the throttle then.
//
// Deliberately fire-and-forget: this is a side effect of the request, not
// something the response should wait on or fail because of.
'use strict';

const { pool } = require('../db/pool');
const logger = require('../logger');
const { getOrCreateAccountIdForUsername } = require('../lib/accountLookup');
const { guessDeviceLabel } = require('../lib/uaLabel');
const { lookupLocationLabel } = require('../lib/geoip');

function trackSessionDevice(req, res, next) {
    if (req.session && req.session.user && req.sessionID) {
        recordDevice(req).catch((err) => {
            logger.warn({ err }, 'session device tracking failed');
        });
    }
    next();
}

async function recordDevice(req) {
    const accountId = await getOrCreateAccountIdForUsername(req.session.user);
    if (!accountId) return;

    const userAgent = (req.headers['user-agent'] || '').slice(0, 512);
    const label = guessDeviceLabel(userAgent);
    // Best-effort; lookupLocationLabel never throws and caches by IP, so
    // this doesn't add a network round trip on every single request once a
    // given IP has been resolved once.
    const locationLabel = await lookupLocationLabel(req.ip);

    await pool.execute(
        `INSERT INTO session_devices (session_id, account_id, user_agent, ip_address, location_label, label)
         VALUES (?, ?, ?, ?::inet, ?, ?)
         ON CONFLICT (session_id) DO UPDATE SET
             last_seen_at = NOW(),
             user_agent = EXCLUDED.user_agent,
             location_label = EXCLUDED.location_label,
             label = EXCLUDED.label`,
        [req.sessionID, accountId, userAgent || null, req.ip || null, locationLabel, label]
    );
}

module.exports = { trackSessionDevice };
