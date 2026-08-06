const { pool } = require('../db/pool');

async function findByUsername(username) {
    const [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [username]);
    return rows[0] || null;
}

module.exports = { findByUsername };
