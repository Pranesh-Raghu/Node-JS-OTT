// Migrates the legacy `users`/`admins` tables into `accounts` + one default
// `profile` per account. Idempotent (safe to re-run) — skips usernames that
// already exist in `accounts`.
//
// Per the plan: admin passwords are currently plaintext in the legacy table,
// so they are NOT copied into password_hash. Those accounts land in
// 'pending_reset' with a NULL hash, forcing a real password reset before
// they can be used against the new schema (a later auth phase wires this up).
'use strict';
require('dotenv').config();
const { ulid } = require('ulid');
const { pool } = require('../src/db/pool');

async function main() {
    const [existing] = await pool.execute('SELECT username FROM accounts');
    const existingUsernames = new Set(existing.map((r) => r.username));

    const [users] = await pool.execute('SELECT username, password FROM users');
    const [admins] = await pool.execute('SELECT username FROM admins');

    let accountsCreated = 0;
    let profilesCreated = 0;
    let skipped = 0;

    for (const user of users) {
        if (existingUsernames.has(user.username)) {
            skipped += 1;
            continue;
        }
        // Google-only accounts have a NULL users.password - password_algo
        // must stay NULL alongside it, or this violates the
        // ck_accounts_hash_pair check constraint.
        const passwordAlgo = user.password ? 'bcrypt' : null;
        const [rows] = await pool.execute(
            `INSERT INTO accounts (ulid, username, password_hash, password_algo, role, status)
             VALUES (?, ?, ?, ?, 'user', 'active') RETURNING id`,
            [ulid(), user.username, user.password, passwordAlgo]
        );
        await pool.execute(
            `INSERT INTO profiles (ulid, account_id, name, is_default) VALUES (?, ?, 'Default', TRUE)`,
            [ulid(), rows[0].id]
        );
        existingUsernames.add(user.username);
        accountsCreated += 1;
        profilesCreated += 1;
    }

    for (const admin of admins) {
        if (existingUsernames.has(admin.username)) {
            skipped += 1;
            continue;
        }
        const [rows] = await pool.execute(
            `INSERT INTO accounts (ulid, username, password_hash, password_algo, role, status, must_reset_password)
             VALUES (?, ?, NULL, NULL, 'admin', 'pending_reset', TRUE) RETURNING id`,
            [ulid(), admin.username]
        );
        await pool.execute(
            `INSERT INTO profiles (ulid, account_id, name, is_default) VALUES (?, ?, 'Default', TRUE)`,
            [ulid(), rows[0].id]
        );
        existingUsernames.add(admin.username);
        accountsCreated += 1;
        profilesCreated += 1;
    }

    console.log(`Accounts created: ${accountsCreated}, profiles created: ${profilesCreated}, skipped (already existed): ${skipped}`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
