const { Pool, types } = require('pg');
const config = require('../config');

// pg's default type parser turns DATE (OID 1082) and TIMESTAMP columns into
// JS Date objects in the server's local timezone, which can shift a stored
// date by a day depending on where the process runs (the same footgun
// mysql2's `dateStrings`/`timezone: 'Z'` config existed to avoid). Returning
// the raw string instead keeps date handling identical to how it worked
// under MySQL - callers already expect a string here (see src/lib/dates.js).
types.setTypeParser(1082, (val) => val); // date
types.setTypeParser(1114, (val) => val); // timestamp without time zone

const pool = new Pool({
    connectionString: config.DATABASE_URL,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

function toPositionalPlaceholders(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${(i += 1)}`);
}

// Compatibility shim over pg's client/pool: the whole repository layer was
// written against mysql2/promise's shape - `const [rows] = await
// pool.execute(sql, params)` with `?` placeholders, and mysql2's historical
// split between .execute() (real prepared statements) and .query() (needed
// for LIMIT/OFFSET params, which .execute() couldn't bind reliably). pg's
// query() handles parameter binding uniformly with no such split, so both
// method names below point at the same implementation, and this converts
// `?` -> `$1, $2, ...` and returns `[rows]` so every existing call site's
// destructuring keeps working unchanged. There is no `result.insertId`
// equivalent in Postgres - the handful of INSERTs that relied on it were
// changed to add `RETURNING id` and read `rows[0].id` instead.
//
// `.affectedRows` is attached onto the returned rows array (arrays are
// objects, so this is a legal extra property) mapped from pg's `rowCount` -
// mysql2 exposes UPDATE/DELETE affected-row counts as `result.affectedRows`
// on what's destructured as `const [result] = ...`, and at least one caller
// (the OAuth authorization-code atomic-consume check, the single most
// security-sensitive query in this codebase - see auth/oidc/routes.js)
// depends on that count being right to detect a replay. Getting this wrong
// silently breaks replay detection instead of throwing, so it's handled
// here once rather than trusted to every call site to know to use
// `rowCount` instead.
function wrapQueryable(queryable) {
    async function run(sql, params = []) {
        const result = await queryable.query(toPositionalPlaceholders(sql), params);
        const rows = result.rows;
        rows.affectedRows = result.rowCount;
        return [rows, result.fields];
    }
    return { query: run, execute: run };
}

const wrappedPool = { ...wrapQueryable(pool), end: () => pool.end() };

async function withTransaction(fn) {
    const client = await pool.connect();
    const wrappedClient = wrapQueryable(client);
    try {
        await client.query('BEGIN');
        const result = await fn(wrappedClient);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

async function ping() {
    const [rows] = await wrappedPool.query('SELECT 1 AS ok');
    return rows[0].ok === 1;
}

module.exports = {
    pool: wrappedPool,
    withTransaction,
    ping,
    // The raw pg.Pool, for the one caller that needs it directly:
    // connect-pg-simple (see app.js) makes its own internal queries and
    // expects genuine pg Result objects, not this file's [rows, fields]
    // compatibility shape.
    rawPool: pool,
};
