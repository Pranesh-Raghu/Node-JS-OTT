// Security fix: signing_keys.private_jwk was stored as a plain JSON JWK
// (see the removed comment in src/auth/oidc/keys.js). This AES-256-GCM-
// wraps every existing row in place, matching the encryption
// getOrCreateKey()/rotateSigningKey() now do for every new key. Idempotent
// - an already-wrapped row is a JSON object with a `v` version field the
// plain JWK shape never has, so a re-run skips it.
const crypto = require('crypto');

const KEK_SECRET = process.env.SIGNING_KEY_ENCRYPTION_KEY || 'dev-only-signing-kek-change-me';

function deriveKek() {
    return crypto.createHash('sha256').update(KEK_SECRET).digest();
}

function encryptPrivateJwk(jwk) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', deriveKek(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(jwk), 'utf8'), cipher.final()]);
    return {
        v: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: ciphertext.toString('base64'),
    };
}

exports.up = async function up(knex) {
    const { rows } = await knex.raw('SELECT kid, private_jwk FROM signing_keys');
    for (const row of rows) {
        if (row.private_jwk && row.private_jwk.v === 1) continue; // already wrapped
        const wrapped = encryptPrivateJwk(row.private_jwk);
        // eslint-disable-next-line no-await-in-loop -- one-time backfill, tiny table
        await knex.raw('UPDATE signing_keys SET private_jwk = ? WHERE kid = ?', [JSON.stringify(wrapped), row.kid]);
    }
};

exports.down = async function down() {
    // Not reversible without the same KEK used at encryption time, and
    // reverting to plaintext-at-rest is strictly worse than leaving this
    // migration applied - no down path.
    throw new Error('20260807000002_encrypt_signing_keys is not reversible');
};
