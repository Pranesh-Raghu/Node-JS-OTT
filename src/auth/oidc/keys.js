// Signing key management. Simplified per the "move fast" directive: single
// active ES256 key, no staged next/current/retiring rotation, private JWK
// stored as plain JSON (not AES-GCM-wrapped) — both flagged as follow-ups
// before any real deployment, not appropriate to skip silently.
const { generateKeyPair, exportJWK, SignJWT, importJWK, jwtVerify } = require('jose');
const { pool } = require('../../db/pool');

let cachedKey = null;

async function getOrCreateKey() {
    if (cachedKey) return cachedKey;

    const [rows] = await pool.execute(
        "SELECT kid, alg, public_jwk, private_jwk FROM signing_keys WHERE state = 'current' LIMIT 1"
    );
    if (rows.length > 0) {
        const row = rows[0];
        const publicJwk = row.public_jwk; // mysql2 auto-parses JSON columns
        const privateJwk = row.private_jwk;
        cachedKey = {
            kid: row.kid,
            alg: row.alg,
            publicJwk,
            privateKey: await importJWK(privateJwk, row.alg),
        };
        return cachedKey;
    }

    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const kid = `key_${Date.now()}`;
    const publicJwk = { ...(await exportJWK(publicKey)), kid, use: 'sig', alg: 'ES256' };
    const privateJwk = { ...(await exportJWK(privateKey)), kid };

    await pool.execute(
        'INSERT INTO signing_keys (kid, alg, public_jwk, private_jwk) VALUES (?, ?, ?, ?)',
        [kid, 'ES256', JSON.stringify(publicJwk), JSON.stringify(privateJwk)]
    );

    cachedKey = { kid, alg: 'ES256', publicJwk, privateKey };
    return cachedKey;
}

async function getJwks() {
    await getOrCreateKey();
    const [rows] = await pool.execute("SELECT public_jwk FROM signing_keys");
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
    const { publicJwk } = await getOrCreateKey();
    const publicKey = await importJWK(publicJwk, 'ES256');
    const { payload, protectedHeader } = await jwtVerify(token, publicKey, {
        algorithms: ['ES256'],
        issuer: process.env.OAUTH_ISSUER || 'http://localhost:1000',
        audience,
    });
    if (protectedHeader.typ !== 'at+jwt') {
        throw new Error('Wrong token type');
    }
    return payload;
}

module.exports = { getOrCreateKey, getJwks, signAccessToken, verifyAccessToken };
