// Signing key management.
//
// Encryption at rest: the private JWK is AES-256-GCM-wrapped with a KEK
// derived from SIGNING_KEY_ENCRYPTION_KEY before it's ever written to
// signing_keys.private_jwk, so a read-only DB leak (backup, replica,
// misconfigured access, SQLi elsewhere) doesn't hand over the raw OAuth
// signing key - only the derived, useless-without-the-KEK ciphertext. The
// KEK itself is derived by hashing the env var to exactly 32 bytes (SHA-256
// digest), the same "hash a passphrase-shaped secret to the right key
// length" approach as API_KEY_PEPPER in src/auth/api-keys/index.js - so an
// operator can set any string, not specifically a base64 32-byte value.
//
// Rotation: getOrCreateKey() re-checks the DB every KEY_CACHE_TTL_MS
// instead of caching forever, so a key rotated by scripts/rotate-signing-
// key.js (a separate process) is picked up by a running server without
// needing a restart. verifyAccessToken() looks up the token's own `kid`
// from its header rather than assuming "current" - a token signed just
// before a rotation must still verify during its remaining lifetime
// (access tokens live 10 minutes; the previous "current" key moves to
// 'retiring', not deleted, specifically so this keeps working).
const crypto = require('crypto');
const { generateKeyPair, exportJWK, SignJWT, importJWK, jwtVerify, decodeProtectedHeader } = require('jose');
const { pool } = require('../../db/pool');

const KEY_CACHE_TTL_MS = 5 * 60 * 1000;
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

function decryptPrivateJwk(blob) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKek(), Buffer.from(blob.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(blob.tag, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(blob.data, 'base64')), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8'));
}

let cachedCurrentKey = null;
let cachedAt = 0;

async function loadOrCreateCurrentKey() {
    const [rows] = await pool.execute(
        "SELECT kid, alg, public_jwk, private_jwk FROM signing_keys WHERE state = 'current' LIMIT 1"
    );
    if (rows.length > 0) {
        const row = rows[0];
        return {
            kid: row.kid,
            alg: row.alg,
            publicJwk: row.public_jwk,
            privateKey: await importJWK(decryptPrivateJwk(row.private_jwk), row.alg),
        };
    }

    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const kid = `key_${Date.now()}`;
    const publicJwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'ES256' };
    const privateJwk = { ...(await exportJWK(privateKey)), kid };

    await pool.execute(
        "INSERT INTO signing_keys (kid, alg, state, public_jwk, private_jwk) VALUES (?, ?, 'current', ?, ?)",
        [kid, 'ES256', JSON.stringify(publicJwk), JSON.stringify(encryptPrivateJwk(privateJwk))]
    );

    return { kid, alg: 'ES256', publicJwk, privateKey };
}

async function getOrCreateKey() {
    if (cachedCurrentKey && Date.now() - cachedAt < KEY_CACHE_TTL_MS) return cachedCurrentKey;
    cachedCurrentKey = await loadOrCreateCurrentKey();
    cachedAt = Date.now();
    return cachedCurrentKey;
}

// Generates a fresh key, demotes whatever was 'current' to 'retiring' (kept,
// not deleted - see verifyAccessToken), and makes the new one 'current'.
// Exported for scripts/rotate-signing-key.js; not called automatically -
// this codebase has no scheduler, and unattended key rotation is a
// decision worth an operator triggering deliberately, not a cron job
// silently doing it.
async function rotateSigningKey() {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const kid = `key_${Date.now()}`;
    const publicJwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'ES256' };
    const privateJwk = { ...(await exportJWK(privateKey)), kid };

    await pool.execute("UPDATE signing_keys SET state = 'retiring' WHERE state = 'current'");
    await pool.execute(
        "INSERT INTO signing_keys (kid, alg, state, public_jwk, private_jwk) VALUES (?, ?, 'current', ?, ?)",
        [kid, 'ES256', JSON.stringify(publicJwk), JSON.stringify(encryptPrivateJwk(privateJwk))]
    );

    cachedCurrentKey = null; // force the next getOrCreateKey() in this process to reload
    return kid;
}

async function getJwks() {
    await getOrCreateKey();
    // No `state` filter - a retiring key's public JWK must stay published
    // here for as long as tokens it signed could still be outstanding
    // (access tokens live 10 minutes), or a resource server verifying via
    // this endpoint would reject them mid-lifetime right after a rotation.
    const [rows] = await pool.execute('SELECT public_jwk FROM signing_keys');
    return { keys: rows.map((r) => r.public_jwk) };
}

async function signAccessToken({ sub, aud, clientId, scope, jti }) {
    const key = await getOrCreateKey();
    return new SignJWT({ scope, client_id: clientId })
        .setProtectedHeader({ alg: 'ES256', kid: key.kid, typ: 'at+jwt' })
        .setSubject(sub)
        .setAudience(aud)
        .setIssuer(process.env.OAUTH_ISSUER || 'http://localhost:1000')
        .setJti(jti)
        .setIssuedAt()
        .setExpirationTime('10m')
        .sign(key.privateKey);
}

async function verifyAccessToken(token, { audience } = {}) {
    // Look up the key this specific token claims to be signed with, not
    // whatever's "current" right now - a token signed moments before a
    // rotation carries the old (now 'retiring') kid, and must still verify
    // until it naturally expires.
    let kid;
    try {
        ({ kid } = decodeProtectedHeader(token));
    } catch {
        throw new Error('Malformed token header');
    }
    if (!kid) throw new Error('Token header missing kid');

    const [rows] = await pool.execute('SELECT alg, public_jwk FROM signing_keys WHERE kid = ?', [kid]);
    if (rows.length === 0) throw new Error('Unknown signing key');
    const { alg, public_jwk: publicJwk } = rows[0];

    const publicKey = await importJWK(publicJwk, alg);
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: [alg],
        issuer: process.env.OAUTH_ISSUER || 'http://localhost:1000',
        audience,
    });
    if (protectedHeader.typ !== 'at+jwt') {
        throw new Error('Wrong token type');
    }
    return payload;
}

module.exports = { getOrCreateKey, rotateSigningKey, getJwks, signAccessToken, verifyAccessToken };
