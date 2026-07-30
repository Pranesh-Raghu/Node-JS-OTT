const { pool } = require('../db/pool');

// TODO(security): admin credentials are still compared in plaintext SQL here.
// Deferred to the Phase 3 DB migration, which introduces hashed admin
// passwords. Do not add new admin accounts against this path until that
// migration lands.
async function findByCredentials(username, password) {
    const [rows] = await pool.execute(
        'SELECT * FROM admins WHERE username = ? AND password = ?',
        [username, password]
    );
    return rows[0] || null;
}

module.exports = { findByCredentials };
