'use strict';

// Runs against the real Express app and the real DATABASE_URL from .env -
// there's no mocking layer in this codebase (see README's repository-only-
// raw-SQL convention), so these are integration tests. Anything they
// create in the DB is cleaned up in a `finally`, not left behind.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const { pool } = require('../src/db/pool');

const app = createApp();

function extractCsrfToken(res) {
    return res.body.csrfToken;
}

test('GET /api/session is always 200, even anonymous, and carries theme + csrfToken', async () => {
    const res = await request(app).get('/api/session');
    assert.equal(res.status, 200);
    assert.equal(res.body.user, null);
    assert.equal(typeof res.body.theme, 'string');
    assert.equal(typeof res.body.csrfToken, 'string');
    assert.ok(res.body.csrfToken.length > 0);
});

test('GET /api/search needs no CSRF token (GET is exempt by csrf-sync default, not a special-cased route)', async () => {
    const res = await request(app).get('/api/search').query({ q: 'man' });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.movies));
});

// The regression test for the CSRF fix in src/middleware/csrf.js - this is
// the one to run first when reviewing any future change near that file.
// A `req.path.startsWith('/api/')` exemption there again would make this
// pass when it must fail.
test('POST /api/theme without a CSRF token is rejected with EBADCSRFTOKEN', async () => {
    const res = await request(app).post('/api/theme').send({ theme: 'light' });
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'EBADCSRFTOKEN');
});

test('POST /api/theme with a valid session-bound CSRF token succeeds', async () => {
    const agent = request.agent(app);
    const sessionRes = await agent.get('/api/session');
    const token = extractCsrfToken(sessionRes);

    const res = await agent.post('/api/theme').set('X-CSRF-Token', token).send({ theme: 'light' });
    assert.equal(res.status, 200);
    assert.equal(res.body.theme, 'light');
});

test('requireApiLogin: mutating /api/account/sessions without a session returns 401, not a redirect', async () => {
    const agent = request.agent(app);
    const sessionRes = await agent.get('/api/session');
    const token = extractCsrfToken(sessionRes);

    // A valid CSRF token but no logged-in user - isolates the auth guard
    // from the CSRF check, which runs first in the middleware chain.
    const res = await agent.delete('/api/account/sessions').set('X-CSRF-Token', token);
    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthenticated');
});

test('GET /api/titles/:id for a nonexistent id returns 404, not a rendered page', async () => {
    const res = await request(app).get('/api/titles/999999999');
    assert.equal(res.status, 404);
});

test('GET /movie/:id shell serves the SPA for anyone (guard is at the API layer + the FGA route guard)', async () => {
    const res = await request(app).get('/movie/1');
    assert.ok(res.status === 200 || res.status === 404); // 404 if id 1 doesn't exist in this DB; either way, not a 500
});

test('GET /account/sessions shell redirects an anonymous visitor to /login with redirectTo', async () => {
    const res = await request(app).get('/account/sessions');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/login?redirectTo=%2Faccount%2Fsessions');
});

test('GET /admin shell redirects an anonymous visitor to /admin/login', async () => {
    const res = await request(app).get('/admin');
    assert.equal(res.status, 302);
    assert.equal(res.headers.location, '/admin/login');
});

// Full authenticated round trip: signup -> session -> watchlist add/list/
// remove. Exercises session.regenerate() on signup, the CSRF token that
// comes back afterward, and the watchlist API against a real published
// title - the closest thing to an end-to-end test this suite has.
test('signup -> watchlist add/list/remove works end-to-end', async (t) => {
    const agent = request.agent(app);
    const username = `apitest_${Date.now()}`;
    const email = `${username}@example.com`;

    t.after(async () => {
        await pool.execute('DELETE FROM watchlist_items WHERE profile_id IN (SELECT id FROM profiles WHERE account_id = (SELECT id FROM accounts WHERE username = ?))', [username]);
        await pool.execute('DELETE FROM profiles WHERE account_id = (SELECT id FROM accounts WHERE username = ?)', [username]);
        await pool.execute('DELETE FROM accounts WHERE username = ?', [username]);
        await pool.execute('DELETE FROM users WHERE username = ?', [username]);
    });

    const preSignupSession = await agent.get('/api/session');
    const signupToken = extractCsrfToken(preSignupSession);

    const signupRes = await agent
        .post('/signup')
        .type('form')
        .send({ email, password: 'TestPass123!', _csrf: signupToken });
    assert.equal(signupRes.status, 302);

    const sessionRes = await agent.get('/api/session');
    assert.equal(sessionRes.body.user, username);
    const token = extractCsrfToken(sessionRes);

    const [[title]] = await pool.execute("SELECT id FROM titles WHERE status = 'published' LIMIT 1");
    assert.ok(title, 'expected at least one published title to exist for this test to run against');

    const addRes = await agent.post('/api/watchlist').set('X-CSRF-Token', token).send({ titleId: String(title.id) });
    assert.equal(addRes.status, 201);
    assert.equal(addRes.body.added, true);

    const listRes = await agent.get('/api/watchlist');
    assert.ok(listRes.body.items.some((item) => item.id === String(title.id)));

    const removeRes = await agent.delete(`/api/watchlist/${title.id}`).set('X-CSRF-Token', token);
    assert.equal(removeRes.status, 200);
});

after(async () => {
    await pool.end();
});
