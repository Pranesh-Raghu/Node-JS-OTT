const { pool } = require('../db/pool');

async function findByUsername(username) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
}

async function findByEmail(email) {
    if (!email) return null;
    const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
}

// Login accepts either the auto-generated username or the email itself,
// since the user is never shown their generated username at signup.
async function findByUsernameOrEmail(identifier) {
    const [rows] = await pool.execute(
        'SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1',
        [identifier, identifier]
    );
    return rows[0] || null;
}

async function create(username, passwordHash, email) {
    await pool.execute('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [username, passwordHash, email || null]);
}

async function findByGoogleSub(googleSub) {
    const [rows] = await pool.execute('SELECT * FROM users WHERE google_sub = ?', [googleSub]);
    return rows[0] || null;
}

async function createGoogleUser(username, email, googleSub) {
    await pool.execute(
        'INSERT INTO users (username, password, email, google_sub) VALUES (?, NULL, ?, ?)',
        [username, email, googleSub]
    );
}

async function linkGoogleSub(userId, googleSub) {
    await pool.execute('UPDATE users SET google_sub = ? WHERE id = ?', [googleSub, userId]);
}

module.exports = {
    findByUsername,
    findByEmail,
    findByUsernameOrEmail,
    create,
    findByGoogleSub,
    createGoogleUser,
    linkGoogleSub,
};
