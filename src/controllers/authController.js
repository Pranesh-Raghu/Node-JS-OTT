const authService = require('../services/authService');
const { safeRedirect } = require('../lib/safeRedirect');
const sessionDeviceRepo = require('../repositories/sessionDeviceRepo');
const logger = require('../logger');
const googleAuth = require('../auth/google');

function regenerateSession(req) {
    // Bug fix: express-session's regenerate() destroys the old session and
    // generates a brand-new empty one - it doesn't just rotate the id. That
    // silently wiped `pendingAuthRequest`, which GET /oauth/authorize
    // (src/auth/oidc/routes.js) writes before redirecting an anonymous user
    // to /login?redirectTo=/oauth/consent. Every login/signup/Google-callback
    // path calls regenerateSession() for session-fixation protection, so an
    // MCP client or AI agent starting OAuth while logged out would log in
    // successfully and then dead-end on GET /oauth/consent with "No pending
    // authorization request". Carry it across the regenerate explicitly.
    const pendingAuthRequest = req.session.pendingAuthRequest;
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            if (pendingAuthRequest) req.session.pendingAuthRequest = pendingAuthRequest;
            resolve();
        });
    });
}

async function showLogin(req, res) {
    res.render('login', { error: null, redirectTo: req.query.redirectTo });
}

async function handleLogin(req, res, next) {
    // `username` field accepts either the auto-generated username or the
    // account's email (the user is never shown their generated username).
    const { username: identifier, password } = req.body || {};
    const redirectTo = req.body?.redirectTo;
    try {
        const user = await authService.verifyUserLogin(identifier, password);
        if (!user) {
            return res.render('login', { error: 'Invalid email/username or password', redirectTo });
        }
        await regenerateSession(req);
        // Always the real DB username, not whatever identifier they typed
        // (which may have been the email) — everything downstream treats
        // req.session.user as the canonical username.
        req.session.user = user.username;
        req.session.email = user.email || null;
        req.session.avatarUrl = user.avatar_url || null;
        safeRedirect(res, redirectTo, '/');
    } catch (err) {
        next(err);
    }
}

async function showSignup(req, res) {
    res.render('signup', { error: null });
}

async function handleSignup(req, res, next) {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.render('signup', { error: 'Email and password are required' });
    }
    try {
        const result = await authService.signupUser(email, password);
        if (!result.ok) {
            return res.render('signup', { error: result.error });
        }
        await regenerateSession(req);
        req.session.user = result.username;
        req.session.email = email;
        req.session.avatarUrl = null;
        res.redirect('/');
    } catch (err) {
        next(err);
    }
}

async function handleLogout(req, res, next) {
    // Best-effort: there's no FK from session_devices to the express-mysql-
    // session-owned `sessions` table (see the sessions_webhooks migration),
    // so req.session.destroy() below won't clean this row up on its own --
    // do it explicitly rather than leaving an orphan.
    const sessionId = req.sessionID;
    sessionDeviceRepo.deleteBySessionId(sessionId).catch((err) => {
        logger.warn({ err }, 'failed to clean up session_devices row on logout');
    });

    req.session.destroy((err) => {
        if (err) return next(err);
        res.redirect('/');
    });
}

async function showAdminLogin(req, res) {
    res.render('adminLogin', { error: null });
}

async function handleAdminLogin(req, res, next) {
    const { username, password } = req.body || {};
    try {
        const admin = await authService.verifyAdminLogin(username, password);
        if (!admin) {
            return res.render('adminLogin', { error: 'Invalid admin credentials' });
        }
        await regenerateSession(req);
        req.session.admin = username;
        res.redirect('/admin');
    } catch (err) {
        next(err);
    }
}

async function handleAdminLogout(req, res, next) {
    req.session.destroy((err) => {
        if (err) return next(err);
        res.redirect('/admin/login');
    });
}

async function startGoogleLogin(req, res) {
    const state = googleAuth.generateState();
    req.session.googleOauthState = state;
    // Preserve where the user was trying to go (e.g. redirected from a
    // login-required page) across the round trip to Google and back.
    req.session.googleOauthRedirectTo = req.query.redirectTo || null;
    res.redirect(googleAuth.buildAuthUrl(req, state));
}

async function handleGoogleCallback(req, res, next) {
    const { code, state } = req.query;
    const expectedState = req.session.googleOauthState;
    const redirectTo = req.session.googleOauthRedirectTo;
    delete req.session.googleOauthState;
    delete req.session.googleOauthRedirectTo;

    if (!code || !state || !expectedState || state !== expectedState) {
        return res.status(400).render('login', { error: 'Google sign-in failed (invalid state). Please try again.', redirectTo: null });
    }

    try {
        const profile = await googleAuth.exchangeCodeForProfile(req, code);
        if (!profile.email) {
            return res.status(400).render('login', { error: 'Google did not provide an email address.', redirectTo: null });
        }
        const user = await authService.findOrCreateGoogleUser(profile);

        await regenerateSession(req);
        req.session.user = user.username;
        req.session.email = user.email || null;
        req.session.avatarUrl = user.avatar_url || null;
        safeRedirect(res, redirectTo, '/');
    } catch (err) {
        next(err);
    }
}

module.exports = {
    showLogin,
    handleLogin,
    showSignup,
    handleSignup,
    handleLogout,
    startGoogleLogin,
    handleGoogleCallback,
    showAdminLogin,
    handleAdminLogin,
    handleAdminLogout,
};
