const { pool } = require('../db/pool');

// Deliberately excludes avatar_image (a LONGBLOB that can be several MiB) -
// every login/session lookup goes through these functions, and dragging the
// image bytes along on every request would be wasteful. Only
// getAvatarImage() below selects it, for the one route that actually needs
// the bytes (GET /account/avatar/:username).
const USER_COLUMNS = 'id, username, password, email, google_sub, avatar_url, avatar_mime';

async function findByUsername(username) {
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE username = ?`, [username]);
    return rows[0] || null;
}

async function findByEmail(email) {
    if (!email) return null;
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE email = ?`, [email]);
    return rows[0] || null;
}

// Login accepts either the auto-generated username or the email itself,
// since the user is never shown their generated username at signup.
async function findByUsernameOrEmail(identifier) {
    const [rows] = await pool.execute(
        `SELECT ${USER_COLUMNS} FROM users WHERE username = ? OR email = ? LIMIT 1`,
        [identifier, identifier]
    );
    return rows[0] || null;
}

async function create(username, passwordHash, email) {
    await pool.execute('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [username, passwordHash, email || null]);
}

async function findByGoogleSub(googleSub) {
    const [rows] = await pool.execute(`SELECT ${USER_COLUMNS} FROM users WHERE google_sub = ?`, [googleSub]);
    return rows[0] || null;
}

async function createGoogleUser(username, email, googleSub, avatarUrl) {
    await pool.execute(
        'INSERT INTO users (username, password, email, google_sub, avatar_url) VALUES (?, NULL, ?, ?, ?)',
        [username, email, googleSub, avatarUrl || null]
    );
}

async function linkGoogleSub(userId, googleSub, avatarUrl) {
    // COALESCE(avatar_url, ?) keeps any avatar_url the account already has
    // (e.g. a custom upload) rather than overwriting it with Google's photo
    // on every login.
    await pool.execute(
        'UPDATE users SET google_sub = ?, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
        [googleSub, avatarUrl || null, userId]
    );
}

// Refreshes avatar_url for an account that's already linked to Google, so a
// login before this field existed (or before Google returned a picture) gets
// backfilled on the next sign-in, without clobbering a real custom upload.
async function syncGoogleAvatar(userId, avatarUrl) {
    if (!avatarUrl) return;
    await pool.execute('UPDATE users SET avatar_url = COALESCE(avatar_url, ?) WHERE id = ?', [avatarUrl, userId]);
}

// Clears the avatar entirely - always also nulls avatar_image/avatar_mime,
// since a cleared avatar_url should never leave orphaned image bytes behind.
async function clearAvatar(username) {
    await pool.execute(
        'UPDATE users SET avatar_url = NULL, avatar_image = NULL, avatar_mime = NULL WHERE username = ?',
        [username]
    );
}

// Stores an uploaded image's bytes directly in the database (see the
// avatar_image migration for why - Render's web service filesystem is
// ephemeral). avatarUrl is our own serving route, not an external link.
async function setUploadedAvatarImage(username, buffer, mime, avatarUrl) {
    await pool.execute(
        'UPDATE users SET avatar_image = ?, avatar_mime = ?, avatar_url = ? WHERE username = ?',
        [buffer, mime, avatarUrl, username]
    );
}

// The one place avatar_image is actually selected - used only by
// GET /account/avatar/:username to stream the bytes back.
async function getAvatarImage(username) {
    const [rows] = await pool.execute(
        'SELECT avatar_image, avatar_mime FROM users WHERE username = ?',
        [username]
    );
    return rows[0] || null;
}

module.exports = {
    findByUsername,
    findByEmail,
    findByUsernameOrEmail,
    create,
    findByGoogleSub,
    createGoogleUser,
    linkGoogleSub,
    syncGoogleAvatar,
    clearAvatar,
    setUploadedAvatarImage,
    getAvatarImage,
};
