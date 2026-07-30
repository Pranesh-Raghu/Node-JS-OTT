'use strict';

const webhookRepo = require('../repositories/webhookRepo');
const { validateWebhookUrl } = require('../webhooks/urlSafety');
const { getOrCreateAccountIdForUsername } = require('../lib/accountLookup');

// Only event this codebase currently emits (title creation, see
// titleRepo.createTitle) -- deliberately not inventing events for features
// that don't exist yet.
const AVAILABLE_EVENTS = ['title.published'];

async function listWebhooks(req, res, next) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent('/account/webhooks')}`);
    }
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        const endpoints = accountId ? await webhookRepo.listByAccount(accountId) : [];
        const endpointsWithDeliveries = await Promise.all(
            endpoints.map(async (endpoint) => ({
                ...endpoint,
                deliveries: await webhookRepo.listRecentDeliveries(endpoint.id, 5),
            }))
        );

        res.render('account/webhooks', {
            user: req.session.user,
            endpoints: endpointsWithDeliveries,
            availableEvents: AVAILABLE_EVENTS,
            newSecret: req.query.newSecret || null,
            message: req.query.message || null,
            error: req.query.error || null,
        });
    } catch (err) {
        next(err);
    }
}

async function createWebhook(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        if (!accountId) {
            return res.redirect(`/account/webhooks?error=${encodeURIComponent('Could not resolve your account. Try logging in again.')}`);
        }

        const url = (req.body?.url || '').trim();
        const rawEventTypes = req.body?.event_types;
        const requestedEvents = Array.isArray(rawEventTypes) ? rawEventTypes : rawEventTypes ? [rawEventTypes] : [];
        const eventTypes = requestedEvents.filter((event) => AVAILABLE_EVENTS.includes(event));

        if (!url || eventTypes.length === 0) {
            return res.redirect(`/account/webhooks?error=${encodeURIComponent('Provide a URL and select at least one event type.')}`);
        }

        const validation = await validateWebhookUrl(url);
        if (!validation.ok) {
            return res.redirect(`/account/webhooks?error=${encodeURIComponent(validation.error)}`);
        }

        const { id, secret } = await webhookRepo.createEndpoint({ accountId, url, eventTypes });
        // Secret is shown exactly once, via the query string on this
        // redirect -- there is no other retrieval path afterwards.
        res.redirect(`/account/webhooks?newSecret=${encodeURIComponent(secret.toString('hex'))}#endpoint-${id}`);
    } catch (err) {
        next(err);
    }
}

async function toggleWebhook(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        const endpoint = accountId ? await webhookRepo.findByIdForAccount(req.params.id, accountId) : null;
        if (endpoint) {
            const nextStatus = endpoint.status === 'enabled' ? 'disabled' : 'enabled';
            await webhookRepo.setStatus(endpoint.id, accountId, nextStatus);
        }
        res.redirect('/account/webhooks');
    } catch (err) {
        next(err);
    }
}

async function deleteWebhook(req, res, next) {
    if (!req.session.user) return res.redirect('/login');
    try {
        const accountId = await getOrCreateAccountIdForUsername(req.session.user);
        if (accountId) {
            await webhookRepo.deleteEndpoint(req.params.id, accountId);
        }
        res.redirect('/account/webhooks');
    } catch (err) {
        next(err);
    }
}

module.exports = { listWebhooks, createWebhook, toggleWebhook, deleteWebhook, AVAILABLE_EVENTS };
