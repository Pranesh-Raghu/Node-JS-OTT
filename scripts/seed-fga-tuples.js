// Backfills OpenFGA tuples for existing accounts/titles. Idempotent (FGA
// writes are no-ops on an already-existing tuple... actually they error on
// duplicate; this script tolerates that and continues).
'use strict';
require('dotenv').config();
const { pool } = require('../src/db/pool');
const { client } = require('../src/authz/fga');

async function writeIgnoringDup(tuple) {
    try {
        await client.write({ writes: [tuple] });
    } catch (err) {
        // Ignore "already exists" so this script is safely re-runnable.
        if (!String(err.message || '').includes('already exists') && err.status !== 400) {
            console.log('write failed (non-dup):', tuple, err.message);
        }
    }
}

async function main() {
    // Single free tier so every logged-in account is entitled to everything
    // published, matching current app behavior — this is FGA doing real
    // enforcement, just against a permissive default until real tiers exist.
    const [accounts] = await pool.execute('SELECT id, role FROM accounts');
    for (const account of accounts) {
        await writeIgnoringDup({ user: `user:${account.id}`, relation: 'owner', object: `account:${account.id}` });
        await writeIgnoringDup({ user: `account:${account.id}#member`, relation: 'subscriber', object: 'plan:free' });
        if (account.role === 'admin') {
            await writeIgnoringDup({ user: `user:${account.id}`, relation: 'super_admin', object: 'platform:comics_tv' });
        }
    }

    // Per-profile watchlist tuples skipped for now — out of scope for this
    // pass since watchlist is still localStorage-based, not server-side.

    const [titles] = await pool.execute("SELECT id FROM titles WHERE status = 'published'");
    for (const title of titles) {
        await writeIgnoringDup({ user: 'platform:comics_tv', relation: 'parent_platform', object: `title:${title.id}` });
        // Wildcard subject: `published` is a same-object union branch
        // (`can_discover: published or editor`), so the tuple's subject must
        // be `user:*` (anyone), not `platform:comics_tv` — a platform-typed
        // subject can never satisfy a check for a user-typed principal.
        await writeIgnoringDup({ user: 'user:*', relation: 'published', object: `title:${title.id}` });
        await writeIgnoringDup({ user: 'plan:free', relation: 'required_plan', object: `title:${title.id}` });
    }

    console.log(`Seeded tuples for ${accounts.length} accounts and ${titles.length} titles.`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
