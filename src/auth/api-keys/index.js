const crypto = require('crypto');
const { pool } = require('../../db/pool');

// HMAC-SHA256 with a server-side pepper, not bcrypt/argon2id. The key
// already carries 128 bits of CSPRNG entropy, so a slow KDF buys no security
// margin while costing real availability (bcrypt ~100ms/verify on a
// verified-every-request path is a CPU-exhaustion DoS lever).
const PEPPER = process.env.API_KEY_PEPPER || 'dev-only-pepper-change-me';

function generateKey() {
    const random = crypto.randomBytes(16).toString('base64url');
    const keyId = crypto.randomBytes(6).toString('base64url');
    const fullKey = `ctv_live_${keyId}_${random}`;
    return { fullKey, keyId };
}

function hmac(fullKey) {
    return crypto.createHmac('sha256', PEPPER).update(fullKey).digest();
}

async function createApiKey({ accountId, name, scope, expiresInDays = 90 }) {
    const { fullKey, keyId } = generateKey();
    await pool.execute(
        `INSERT INTO api_keys (key_id, secret_hmac, owner_account_id, name, scope, expires_at)
         VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))`,
        [keyId, hmac(fullKey), accountId, name, scope || 'catalog:read', expiresInDays]
    );
    return fullKey; // shown once
}

async function verifyApiKey(fullKey) {
    if (!fullKey || !fullKey.startsWith('ctv_live_')) return null;
    const [rows] = await pool.execute(
        `SELECT * FROM api_keys WHERE secret_hmac = ? AND revoked_at IS NULL AND expires_at > NOW()`,
        [hmac(fullKey)]
    );
    if (rows.length === 0) return null;
    const row = rows[0];
    // Fire-and-forget, not on the critical path.
    pool.execute('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [row.id]).catch(() => {});
    return { accountId: row.owner_account_id, scope: row.scope, keyId: row.key_id };
}

module.exports = { createApiKey, verifyApiKey };
