// Google Sign-In (OAuth 2.0 authorization code flow, we're the client).
// Uses `state` for CSRF protection and a nonce is not needed here since we
// call the userinfo endpoint with the access token rather than parsing the
// ID token ourselves — simpler for a "move fast" pass, at the cost of one
// extra HTTP round trip per login versus verifying the ID token locally.
const crypto = require('crypto');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

function getRedirectUri(req) {
    return `${req.protocol}://${req.get('host')}/auth/google/callback`;
}

function buildAuthUrl(req, state) {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        redirect_uri: getRedirectUri(req),
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
    });
    return `${GOOGLE_AUTH_URL}?${params}`;
}

async function exchangeCodeForProfile(req, code) {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_CLIENT_ID,
            client_secret: process.env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: getRedirectUri(req),
        }),
    });
    if (!tokenRes.ok) {
        throw new Error(`Google token exchange failed: ${tokenRes.status}`);
    }
    const tokens = await tokenRes.json();

    const userinfoRes = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userinfoRes.ok) {
        throw new Error(`Google userinfo fetch failed: ${userinfoRes.status}`);
    }
    const profile = await userinfoRes.json();

    return {
        sub: profile.sub,
        email: profile.email,
        emailVerified: profile.email_verified === true,
        name: profile.name,
    };
}

function generateState() {
    return crypto.randomBytes(24).toString('base64url');
}

module.exports = { buildAuthUrl, exchangeCodeForProfile, generateState };
