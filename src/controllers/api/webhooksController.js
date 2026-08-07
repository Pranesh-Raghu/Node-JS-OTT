'use strict';

const webhookRepo = require('../../repositories/webhookRepo');
const { validateWebhookUrl } = require('../../webhooks/urlSafety');
const { getOrCreateAccountIdForUsername } = require('../../lib/accountLookup');
const { timestampToIso } = require('../../lib/dates');

// Only event this codebase currently emits (title creation, see
// titleRepo.createTitle) -- deliberately not inventing events for features
// that don't exist yet. Same list the EJS controller used.
const AVAILABLE_EVENTS = ['title.published'];

async function list(req, res, next) {
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        const endpoints = accountId ? await webhookRepo.listByAccount(accountId) : [];
        const endpointsWithDeliveries = await Promise.all(
            endpoints.map(async (endpoint) => ({
                id: endpoint.id,
                url: endpoint.url,
                status: endpoint.status,
                eventTypes: endpoint.event_types,
                createdAt: timestampToIso(endpoint.created_at),
                consecutiveFailures: endpoint.consecutive_failures,
                deliveries: (await webhookRepo.listRecentDeliveries(endpoint.id, 5)).map((d) => ({
                    eventType: d.event_type,
                    status: d.status,
                    attempts: d.attempts,
                    lastError: d.last_error,
                })),
            }))
        );
        res.json({ endpoints: endpointsWithDeliveries, availableEvents: AVAILABLE_EVENTS });
    } catch (err) {
        next(err);
    }
}

async function create(req, res, next) {
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        if (!accountId) {
            return res.status(400).json({ error: 'account_not_found', message: 'Could not resolve your account. Try logging in again.' });
        }

        const url = (req.body?.url || '').trim();
        const rawEventTypes = req.body?.eventTypes;
        const requestedEvents = Array.isArray(rawEventTypes) ? rawEventTypes : [];
        const eventTypes = requestedEvents.filter((event) => AVAILABLE_EVENTS.includes(event));

        if (!url || eventTypes.length === 0) {
            return res.status(400).json({ error: 'invalid_request', message: 'Provide a URL and select at least one event type.' });
        }

        const validation = await validateWebhookUrl(url);
        if (!validation.ok) {
            return res.status(400).json({ error: 'invalid_url', message: validation.error });
        }

        const { id, secret } = await webhookRepo.createEndpoint({ accountId, url, eventTypes });
        // Security win over the pre-migration EJS flow: the secret used to
        // travel in a redirect query string (?newSecret=...), which lands
        // in access logs, browser history, and any subsequent same-origin
        // Referer header. Returning it in the POST response body instead
        // means it never touches a URL.
        res.status(201).json({ id, secret: secret.toString('hex') });
    } catch (err) {
        next(err);
    }
}

async function toggle(req, res, next) {
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        const endpoint = accountId ? await webhookRepo.findByIdForAccount(req.params.id, accountId) : null;
        if (!endpoint) return res.status(404).json({ error: 'not_found' });

        const nextStatus = endpoint.status === 'enabled' ? 'disabled' : 'enabled';
        await webhookRepo.setStatus(endpoint.id, accountId, nextStatus);
        res.json({ status: nextStatus });
    } catch (err) {
        next(err);
    }
}

async function remove(req, res, next) {
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        if (accountId) await webhookRepo.deleteEndpoint(req.params.id, accountId);
        res.json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { list, create, toggle, remove };
