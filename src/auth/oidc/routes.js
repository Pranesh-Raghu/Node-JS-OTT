const express = require('express');
const crypto = require('crypto');
const { ulid } = require('ulid');
const { pool, withTransaction } = require('../../db/pool');
const { findClient, registerClient } = require('./clients');
const { isValidRedirectUri } = require('./redirectUri');
const { isValidChallenge, verifyPkce } = require('./pkce');
const { intersectScopes } = require('./scopes');
const { getJwks, signAccessToken } = require('./keys');
const { safeRedirect } = require('../../lib/safeRedirect');

const router = express.Router();
const ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:1000';
const RESOURCE_ID = process.env.MCP_RESOURCE_ID || `${ISSUER}/mcp`;

function hashCode(code) {
    return crypto.createHash('sha256').update(code).digest();
}

// --- Discovery ---

router.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/oauth/authorize`,
        token_endpoint: `${ISSUER}/oauth/token`,
        registration_endpoint: `${ISSUER}/oauth/register`,
        jwks_uri: `${ISSUER}/oauth/jwks`,
        scopes_supported: ['catalog:read', 'watchlist:read', 'watchlist:write'],
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        client_id_metadata_document_supported: true,
    });
});

router.get('/oauth/jwks', async (req, res, next) => {
    try {
        res.set('Cache-Control', 'public, max-age=300');
        res.json(await getJwks());
    } catch (err) {
        next(err);
    }
});

function protectedResourceDoc(req, res) {
    res.json({
        resource: RESOURCE_ID,
        authorization_servers: [ISSUER],
        scopes_supported: ['catalog:read', 'watchlist:read', 'watchlist:write'],
        bearer_methods_supported: ['header'],
    });
}
router.get('/.well-known/oauth-protected-resource/mcp', protectedResourceDoc);
router.get('/.well-known/oauth-protected-resource', protectedResourceDoc);

// --- Authorize ---

router.get('/oauth/authorize', async (req, res, next) => {
    try {
        const { client_id: clientId, redirect_uri: redirectUri, response_type: responseType,
            code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod,
            scope, state, resource } = req.query;

        const client = clientId ? await findClient(clientId) : null;
        if (!client) {
            return res.status(400).render('oauth/error', { message: 'Unknown client_id' });
        }
        if (!isValidRedirectUri(redirectUri, client.redirectUris)) {
            // Never redirect on redirect_uri mismatch — see plan §5.1.
            return res.status(400).render('oauth/error', { message: 'redirect_uri does not match any registered value' });
        }

        // Only past this point is redirectUri a trusted sink.
        const errorRedirect = (error, description) => {
            const url = new URL(redirectUri);
            url.searchParams.set('error', error);
            if (description) url.searchParams.set('error_description', description);
            if (state) url.searchParams.set('state', state);
            url.searchParams.set('iss', ISSUER);
            return res.redirect(url.toString());
        };

        if (responseType !== 'code') return errorRedirect('unsupported_response_type');
        if (codeChallengeMethod !== 'S256') return errorRedirect('invalid_request', 'code_challenge_method must be S256');
        if (!isValidChallenge(codeChallenge)) return errorRedirect('invalid_request', 'invalid code_challenge');
        if (!state) return errorRedirect('invalid_request', 'state is required');

        const requestedScopes = intersectScopes(scope || 'catalog:read', new Set(client.scope.split(' ')));
        if (requestedScopes.length === 0) return errorRedirect('invalid_scope');

        if (!req.session.user) {
            req.session.pendingAuthRequest = { clientId, redirectUri, codeChallenge, scope: requestedScopes.join(' '), state, resource };
            return res.redirect(`/login?redirectTo=${encodeURIComponent('/oauth/consent')}`);
        }

        res.render('oauth/consent', {
            clientName: client.clientName,
            redirectUri,
            scopes: requestedScopes,
            isLoopback: /^https?:\/\/(127\.0\.0\.1|\[::1\]|localhost)/.test(redirectUri),
            formAction: '/oauth/consent',
            hiddenFields: { clientId, redirectUri, codeChallenge, scope: requestedScopes.join(' '), state, resource: resource || '' },
            csrfToken: res.locals.csrfToken,
        });
    } catch (err) {
        next(err);
    }
});

router.get('/oauth/consent', (req, res) => {
    // Reached via /login?redirectTo=/oauth/consent after auth; resume from session.
    const pending = req.session.pendingAuthRequest;
    if (!pending) return res.status(400).send('No pending authorization request');
    res.redirect(`/oauth/authorize?client_id=${encodeURIComponent(pending.clientId)}&redirect_uri=${encodeURIComponent(pending.redirectUri)}&response_type=code&code_challenge=${encodeURIComponent(pending.codeChallenge)}&code_challenge_method=S256&scope=${encodeURIComponent(pending.scope)}&state=${encodeURIComponent(pending.state)}${pending.resource ? `&resource=${encodeURIComponent(pending.resource)}` : ''}`);
});

router.post('/oauth/consent', async (req, res, next) => {
    try {
        const { clientId, redirectUri, codeChallenge, scope, state, resource } = req.body;
        if (!req.session.user) return res.status(401).send('Not logged in');

        const client = await findClient(clientId);
        if (!client || !isValidRedirectUri(redirectUri, client.redirectUris)) {
            return res.status(400).send('Invalid request');
        }

        const [accountRows] = await pool.execute('SELECT id FROM accounts WHERE username = ?', [req.session.user]);
        if (accountRows.length === 0) return res.status(400).send('Account not found');
        const accountId = accountRows[0].id;

        const code = crypto.randomBytes(32).toString('base64url');
        await pool.execute(
            `INSERT INTO oauth_authorization_codes
               (code_hash, client_id, account_id, redirect_uri, code_challenge, scope, resource, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW() + INTERVAL '60 seconds')`,
            [hashCode(code), clientId, accountId, redirectUri, codeChallenge, scope, resource || null]
        );

        const url = new URL(redirectUri);
        url.searchParams.set('code', code);
        url.searchParams.set('state', state);
        url.searchParams.set('iss', ISSUER);
        res.redirect(url.toString());
    } catch (err) {
        next(err);
    }
});

// --- Token ---

router.post('/oauth/token', express.urlencoded({ extended: false }), async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
        const { grant_type: grantType } = req.body;

        if (grantType === 'authorization_code') {
            const { code, redirect_uri: redirectUri, client_id: clientId, code_verifier: codeVerifier } = req.body;
            if (!code || !codeVerifier || !clientId) {
                return res.status(400).json({ error: 'invalid_request' });
            }

            const codeHash = hashCode(code);
            const [updateResult] = await pool.execute(
                `UPDATE oauth_authorization_codes SET consumed_at = NOW()
                 WHERE code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()`,
                [codeHash]
            );

            if (updateResult.affectedRows === 0) {
                // Replay or unknown/expired code. If it exists and was already
                // consumed, that's a replay: revoke the token family that
                // descended from it (family_id is backfilled onto the code
                // row right after that family is created below), the same
                // way the refresh_token branch below revokes on reuse.
                const [replayedRows] = await pool.execute(
                    'SELECT consumed_at, family_id FROM oauth_authorization_codes WHERE code_hash = ?',
                    [codeHash]
                );
                const replayed = replayedRows[0];
                if (replayed?.consumed_at && replayed.family_id) {
                    await pool.execute(
                        "UPDATE oauth_token_families SET revoked_at = NOW(), revoked_reason = 'code_replay' WHERE family_id = ?",
                        [replayed.family_id]
                    );
                }
                return res.status(400).json({ error: 'invalid_grant' });
            }

            const [codeRows] = await pool.execute(
                'SELECT * FROM oauth_authorization_codes WHERE code_hash = ?',
                [codeHash]
            );
            const codeRow = codeRows[0];
            // client_id/redirect_uri are VARBINARY columns; mysql2 returns
            // them as Buffers, not strings, so they must be stringified
            // before comparison or this always fails even on a match.
            if (codeRow.client_id.toString() !== clientId || codeRow.redirect_uri.toString() !== redirectUri) {
                return res.status(400).json({ error: 'invalid_grant' });
            }
            if (!verifyPkce(codeVerifier, codeRow.code_challenge.toString())) {
                return res.status(400).json({ error: 'invalid_grant' });
            }

            const familyId = ulid();
            await pool.execute(
                `INSERT INTO oauth_token_families (family_id, client_id, account_id, resource, scope, absolute_expires_at)
                 VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL '30 days')`,
                [familyId, clientId, codeRow.account_id, codeRow.resource, codeRow.scope]
            );
            // Link the code back to the family it produced, so a later
            // replay of this same code (see the `affectedRows === 0` branch
            // above) can find and revoke it.
            await pool.execute(
                'UPDATE oauth_authorization_codes SET family_id = ? WHERE code_hash = ?',
                [familyId, codeHash]
            );

            const refreshToken = crypto.randomBytes(32).toString('base64url');
            await pool.execute(
                `INSERT INTO oauth_refresh_tokens (token_hash, family_id, expires_at)
                 VALUES (?, ?, NOW() + INTERVAL '14 days')`,
                [crypto.createHash('sha256').update(refreshToken).digest(), familyId]
            );

            const jti = ulid();
            const accessToken = await signAccessToken({
                sub: `user:${codeRow.account_id}`,
                aud: codeRow.resource || RESOURCE_ID,
                clientId,
                scope: codeRow.scope,
                jti,
            });

            return res.json({
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 600,
                refresh_token: refreshToken,
                scope: codeRow.scope,
            });
        }

        if (grantType === 'refresh_token') {
            const { refresh_token: refreshToken, client_id: clientId } = req.body;
            if (!refreshToken) return res.status(400).json({ error: 'invalid_request' });

            const tokenHash = crypto.createHash('sha256').update(refreshToken).digest();
            const result = await withTransaction(async (conn) => {
                const [updateResult] = await conn.execute(
                    `UPDATE oauth_refresh_tokens SET rotated_at = NOW()
                     WHERE token_hash = ? AND rotated_at IS NULL AND expires_at > NOW()`,
                    [tokenHash]
                );
                if (updateResult.affectedRows === 0) {
                    // Could be replay of an already-rotated token: revoke the family.
                    const [existing] = await conn.execute(
                        'SELECT family_id FROM oauth_refresh_tokens WHERE token_hash = ?',
                        [tokenHash]
                    );
                    if (existing.length > 0) {
                        await conn.execute(
                            "UPDATE oauth_token_families SET revoked_at = NOW(), revoked_reason = 'refresh_reuse' WHERE family_id = ?",
                            [existing[0].family_id]
                        );
                    }
                    return null;
                }
                const [rows] = await conn.execute(
                    'SELECT * FROM oauth_refresh_tokens WHERE token_hash = ?',
                    [tokenHash]
                );
                const row = rows[0];
                const [familyRows] = await conn.execute(
                    'SELECT * FROM oauth_token_families WHERE family_id = ?',
                    [row.family_id]
                );
                const family = familyRows[0];
                if (!family) return null;
                family.client_id = family.client_id.toString();
                if (family.revoked_at || family.client_id !== clientId) return null;

                const newRefreshToken = crypto.randomBytes(32).toString('base64url');
                await conn.execute(
                    `INSERT INTO oauth_refresh_tokens (token_hash, family_id, expires_at)
                     VALUES (?, ?, NOW() + INTERVAL '14 days')`,
                    [crypto.createHash('sha256').update(newRefreshToken).digest(), family.family_id]
                );
                return { family, newRefreshToken };
            });

            if (!result) return res.status(400).json({ error: 'invalid_grant' });

            const jti = ulid();
            const accessToken = await signAccessToken({
                sub: `user:${result.family.account_id}`,
                aud: result.family.resource || RESOURCE_ID,
                clientId: result.family.client_id,
                scope: result.family.scope,
                jti,
            });

            return res.json({
                access_token: accessToken,
                token_type: 'Bearer',
                expires_in: 600,
                refresh_token: result.newRefreshToken,
                scope: result.family.scope,
            });
        }

        res.status(400).json({ error: 'unsupported_grant_type' });
    } catch (err) {
        next(err);
    }
});

// --- DCR ---

router.post('/oauth/register', express.json(), async (req, res, next) => {
    try {
        const client = await registerClient({
            clientName: req.body.client_name,
            redirectUris: req.body.redirect_uris,
            grantTypes: req.body.grant_types,
            scope: req.body.scope,
        });
        res.status(201).json({
            ...client,
            client_id_issued_at: Math.floor(Date.now() / 1000),
        });
    } catch (err) {
        if (err.oauthError) {
            return res.status(400).json({ error: err.oauthError });
        }
        next(err);
    }
});

module.exports = router;
