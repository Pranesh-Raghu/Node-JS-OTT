'use strict';

const sessionDeviceService = require('../../services/sessionDeviceService');
const { timestampToIso } = require('../../lib/dates');

async function listSessions(req, res, next) {
    try {
        const sessions = await sessionDeviceService.listSessionsForUser(req.session.user, req.sessionID);
        res.json({
            sessions: sessions.map((s) => ({
                ...s,
                firstSeenAt: timestampToIso(s.firstSeenAt),
                lastSeenAt: timestampToIso(s.lastSeenAt),
            })),
        });
    } catch (err) {
        next(err);
    }
}

async function revokeSession(req, res, next) {
    try {
        const { sessionId } = req.params;
        const result = await sessionDeviceService.revokeOne(req.session.user, sessionId);
        if (!result.ok) {
            return res.status(404).json({ error: 'not_found', message: 'That session could not be found.' });
        }

        if (sessionId === req.sessionID) {
            // Revoking your own current session: it no longer exists in the
            // `sessions` table, so destroy the in-memory copy too. Unlike
            // the EJS controller this can't res.redirect('/login') itself -
            // the caller is fetch(), not a browser navigation - so it
            // signals selfRevoked and client/src/pages/Sessions.jsx does
            // the navigation.
            return req.session.destroy((err) => {
                if (err) return next(err);
                res.json({ ok: true, selfRevoked: true });
            });
        }

        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

async function revokeAllSessions(req, res, next) {
    try {
        await sessionDeviceService.revokeAll(req.session.user);
        req.session.destroy((err) => {
            if (err) return next(err);
            res.json({ ok: true, loggedOut: true });
        });
    } catch (err) {
        next(err);
    }
}

module.exports = { listSessions, revokeSession, revokeAllSessions };
