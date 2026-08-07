// The app is mid-migration from a legacy `users` table (plaintext session
// identity: authController stores the bare username string in
// req.session.user) to the `accounts` table introduced for the OIDC/OAuth
// track. Anything that needs a durable account_id foreign key -- like the
// session_devices and webhook_endpoints tables added alongside this file --
// has to resolve that username to an accounts.id first.
//
// scripts/backfill-accounts.js does this resolution in bulk. This is the
// lazy, single-row equivalent, so a user who signed up after the last bulk
// backfill run doesn't hit a dead end on the sessions/webhooks pages. It
// deliberately duplicates a few lines of that script's logic rather than
// importing from it, to avoid a dependency between a one-off migration
// script and request-serving code.
'use strict';

const { ulid } = require('ulid');
const { pool, withTransaction } = require('../db/pool');
const { writeTuples } = require('../authz/fga');
const logger = require('../logger');

async function getOrCreateAccountIdForUsername(username) {
    if (!username) return null;

    const [existing] = await pool.execute('SELECT id FROM accounts WHERE username = ?', [username]);
    if (existing.length > 0) return existing[0].id;

    const [users] = await pool.execute('SELECT username, password FROM users WHERE username = ?', [username]);
    if (users.length === 0) return null;

    const accountId = await withTransaction(async (conn) => {
        // Re-check inside the transaction: another request may have created
        // the account between the lookup above and here.
        const [dupe] = await conn.execute('SELECT id FROM accounts WHERE username = ?', [username]);
        if (dupe.length > 0) return { id: dupe[0].id, isNew: false };

        // Google-only accounts have a NULL users.password (see the Google
        // SSO migration) - password_algo must stay NULL alongside it, or
        // this violates the ck_accounts_hash_pair check constraint
        // ((password_hash IS NULL) = (password_algo IS NULL)).
        const passwordAlgo = users[0].password ? 'bcrypt' : null;
        const [rows] = await conn.execute(
            `INSERT INTO accounts (ulid, username, password_hash, password_algo, role, status)
             VALUES (?, ?, ?, ?, 'user', 'active') RETURNING id`,
            [ulid(), username, users[0].password, passwordAlgo]
        );
        const newAccountId = rows[0].id;
        await conn.execute(
            `INSERT INTO profiles (ulid, account_id, name, is_default) VALUES (?, ?, 'Default', TRUE)`,
            [ulid(), newAccountId]
        );
        return { id: newAccountId, isNew: true };
    });

    if (accountId.isNew) {
        // Mirrors scripts/seed-fga-tuples.js's per-account tuples. Without
        // this, an account created through this lazy path (the common case
        // for anyone signing up after the initial bulk seed run) passes
        // can_discover (title-level tuples exist) but fails can_play forever
        // - there's no `subscriber: plan:free` tuple for it, and OpenFGA has
        // no other way to find out this account exists. Best-effort: an FGA
        // outage here shouldn't block account creation/login, since the
        // route-level can_play check already fails closed on its own.
        writeTuples([
            { user: `user:${accountId.id}`, relation: 'owner', object: `account:${accountId.id}` },
            { user: `account:${accountId.id}#member`, relation: 'subscriber', object: 'plan:free' },
        ]).catch((err) => {
            logger.error({ err, accountId: accountId.id }, 'failed to seed OpenFGA tuples for new account');
        });
    }

    return accountId.id;
}

// watchlist_items (migration 0001) is keyed on profile_id, not account_id -
// it was designed for the multi-profile model (see the `profiles` table)
// even though every account currently has exactly one profile. Every
// account-creation path here and in scripts/backfill-accounts.js already
// inserts a 'Default' is_default=TRUE profile alongside the account, so
// this should always find one - the create-if-missing fallback is cheap
// insurance for any account that predates that guarantee, not the expected
// path.
async function getDefaultProfileIdForAccount(accountId) {
    if (!accountId) return null;

    const [existing] = await pool.execute(
        'SELECT id FROM profiles WHERE account_id = ? AND is_default = TRUE AND deleted_at IS NULL LIMIT 1',
        [accountId]
    );
    if (existing.length > 0) return existing[0].id;

    try {
        const [rows] = await pool.execute(
            `INSERT INTO profiles (ulid, account_id, name, is_default) VALUES (?, ?, 'Default', TRUE) RETURNING id`,
            [ulid(), accountId]
        );
        return rows[0].id;
    } catch (err) {
        // uq_profiles_one_default: another concurrent request already won
        // this rare race - re-fetch instead of surfacing a 500 for it.
        if (err.code === '23505') {
            const [rows] = await pool.execute(
                'SELECT id FROM profiles WHERE account_id = ? AND is_default = TRUE AND deleted_at IS NULL LIMIT 1',
                [accountId]
            );
            if (rows.length > 0) return rows[0].id;
        }
        throw err;
    }
}

module.exports = { getOrCreateAccountIdForUsername, getDefaultProfileIdForAccount };
