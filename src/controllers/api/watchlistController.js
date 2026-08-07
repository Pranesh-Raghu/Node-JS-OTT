'use strict';

const watchlistService = require('../../services/watchlistService');

async function list(req, res, next) {
    try {
        const items = await watchlistService.listForUser(req.session.user);
        res.json({ items });
    } catch (err) {
        next(err);
    }
}

async function add(req, res, next) {
    try {
        const titleId = String(req.body?.titleId || '');
        if (!/^\d+$/.test(titleId)) {
            return res.status(400).json({ error: 'invalid_title_id', message: 'titleId must be numeric' });
        }
        const result = await watchlistService.addForUser(req.session.user, titleId);
        if (!result.ok) return res.status(400).json({ error: 'account_not_found' });
        res.status(201).json({ ok: true, added: result.added });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const result = await watchlistService.removeForUser(req.session.user, req.params.titleId);
        if (!result.ok) return res.status(404).json({ error: 'not_found' });
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

// One-time backfill from the client's localStorage - see
// client/src/lib/watchlistMigration.js. Retire once that's rolled out for
// a couple of releases (see the migration plan).
async function importFromClient(req, res, next) {
    try {
        const result = await watchlistService.importForUser(req.session.user, req.body?.titleIds);
        res.json(result);
    } catch (err) {
        next(err);
    }
}

module.exports = { list, add, remove, importFromClient };
