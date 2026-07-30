'use strict';

const sessionDeviceService = require('../services/sessionDeviceService');

async function listSessions(req, res, next) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent('/account/sessions')}`);
    }
    try {
        const sessions = await sessionDeviceService.listSessionsForUser(req.session.user, req.sessionID);
        res.render('account/sessions', {
            user: req.session.user,
            sessions,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
}

async function revokeSession(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        const { sessionId } = req.params;
        const result = await sessionDeviceService.revokeOne(req.session.user, sessionId);

        if (!result.ok) {
            return res.redirect(`/account/sessions?error=${encodeURIComponent('That session could not be found.')}`);
        }

        if (sessionId === req.sessionID) {
            // Revoking your own current session: it no longer exists in the
            // `sessions` table, so destroy the in-memory copy too and send
            // the user to login rather than leaving them on a dead session.
            return req.session.destroy(() => res.redirect('/login'));
        }

        res.redirect(`/account/sessions?message=${encodeURIComponent('Device signed out.')}`);
    } catch (err) {
        next(err);
    }
}

async function revokeAllSessions(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        await sessionDeviceService.revokeAll(req.session.user);
        req.session.destroy((err) => {
            if (err) return next(err);
            res.redirect('/login');
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { listSessions, revokeSession, revokeAllSessions };
