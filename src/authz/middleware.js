const { can } = require('./fga');
const { getOrCreateAccountIdForUsername } = require('../lib/accountLookup');
const { pool } = require('../db/pool');

// Resolves req.session.user -> the FGA subject string "user:<account_id>".
// Returns null for anonymous requests (callers decide what null means for
// their relation — usually "deny" for play/publish, "allow the public
// can_discover branch" for browse).
async function fgaSubjectForRequest(req) {
    if (!req.session.user) return null;
    const accountId = await getOrCreateAccountIdForUsername(req.session.user);
    return accountId ? `user:${accountId}` : null;
}

// Admin auth uses a separate session key (req.session.admin) resolving
// through the legacy `admins` table rather than `users` — those admin
// accounts were already migrated into `accounts` by
// scripts/backfill-accounts.js (with a `super_admin` tuple on
// platform:comics_tv seeded alongside), so this is a direct username
// lookup, not the lazy users->accounts migration path.
async function fgaSubjectForAdminRequest(req) {
    if (!req.session.admin) return null;
    const [rows] = await pool.execute('SELECT id FROM accounts WHERE username = ?', [req.session.admin]);
    return rows.length > 0 ? `user:${rows[0].id}` : null;
}

// tier: 'browse' fails OPEN on an FGA outage (an outage shouldn't take the
// whole homepage down); 'strict' fails CLOSED (playback/admin — an outage
// must not grant access it can't verify).
//
// json: true switches every response below from a plain-text page response
// to a JSON one, for use on /api/* routes (the React SPA) instead of a
// server-rendered page. The status-code semantics are unchanged - only the
// body shape differs - so the fail-open/fail-closed tier logic below stays
// a single shared implementation rather than being forked per caller.
function requireFgaPermission(relation, objectFromReq, { tier = 'strict', admin = false, json = false } = {}) {
    const respond = (res, status, message) =>
        json ? res.status(status).json({ error: message.toLowerCase().replace(/ /g, '_'), message }) : res.status(status).send(message);

    return async (req, res, next) => {
        try {
            const subject = admin ? await fgaSubjectForAdminRequest(req) : await fgaSubjectForRequest(req);
            const object = objectFromReq(req);
            if (!subject) {
                if (tier === 'browse') return next(); // anonymous browse still allowed via can_discover's `published` branch at the app layer
                return respond(res, 401, 'Login required');
            }
            const allowed = await can(subject, relation, object, { failOpen: tier === 'browse' });
            if (!allowed) {
                return tier === 'browse' ? respond(res, 404, 'Not found') : respond(res, 403, 'Not authorized');
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

module.exports = { fgaSubjectForRequest, requireFgaPermission };
