const bcrypt = require('bcrypt');
const userRepo = require('../repositories/userRepo');
const adminRepo = require('../repositories/adminRepo');

const SALT_ROUNDS = 10;
// Fixed dummy hash so "unknown user" / "federated-only account, no
// password" / "wrong password" all cost the same time — otherwise a NULL
// `password` short-circuit would respond measurably faster and leak which
// accounts are Google-only.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', SALT_ROUNDS);

async function verifyUserLogin(identifier, password) {
    const user = await userRepo.findByUsernameOrEmail(identifier);
    // Federated-only accounts (Google sign-in) have password = NULL and can
    // never succeed via this path — but still run a compare against the
    // dummy hash for timing parity with the "wrong password" case.
    const hashToCompare = user?.password || DUMMY_HASH;
    const isMatch = await bcrypt.compare(password, hashToCompare);
    return user && user.password && isMatch ? user : null;
}

// Derives a username from the email's local part (before @), sanitized to
// [a-z0-9_], with a numeric suffix on collision. The user is never shown
// this — login accepts the email itself — it only exists because the
// `users` table's username column is NOT NULL UNIQUE.
async function generateUsernameFromEmail(email) {
    const localPart = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
    const base = localPart || 'user';

    let candidate = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await userRepo.findByUsername(candidate)) {
        suffix += 1;
        candidate = `${base}${suffix}`;
    }
    return candidate;
}

async function signupUser(rawEmail, password) {
    if (!rawEmail || !rawEmail.includes('@')) {
        return { ok: false, error: 'A valid email is required' };
    }
    // Normalized to lowercase before storing or comparing - MySQL's default
    // collation (utf8mb4_0900_ai_ci) made "=" comparisons case-insensitive,
    // which silently covered for the email never being normalized on write.
    // Postgres's default equality is case-sensitive, so without this,
    // "User@x.com" and "user@x.com" would both pass the findByEmail check
    // below and create two accounts for the same real address.
    const email = rawEmail.trim().toLowerCase();
    const existing = await userRepo.findByEmail(email);
    if (existing) {
        return { ok: false, error: 'An account with that email already exists' };
    }

    const username = await generateUsernameFromEmail(email);
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    try {
        await userRepo.create(username, hashed, email);
    } catch (err) {
        // DB-level unique constraint as the race-condition safety net behind
        // the findByEmail check above (two concurrent signups for the same
        // email could otherwise both pass that check). '23505' is
        // Postgres's unique_violation code (MySQL's equivalent was
        // ER_DUP_ENTRY).
        if (err.code === '23505') {
            return { ok: false, error: 'An account with that email already exists' };
        }
        throw err;
    }
    return { ok: true, username };
}

// Same timing-parity approach as verifyUserLogin above: compare against the
// dummy hash even when the username doesn't exist, so "unknown admin" and
// "wrong password" cost the same time and an attacker can't use response
// latency to enumerate valid admin usernames.
async function verifyAdminLogin(username, password) {
    const admin = await adminRepo.findByUsername(username);
    const hashToCompare = admin?.password || DUMMY_HASH;
    const isMatch = await bcrypt.compare(password, hashToCompare);
    return admin && isMatch ? admin : null;
}

// Matches by Google's stable subject id first (survives an email change on
// the Google side), falls back to auto-linking by email — safe here
// specifically because Google itself verifies account emails, unlike a
// generic self-asserted OIDC provider where auto-linking on email is an
// account-takeover risk (see the design notes on this). Creates a new
// account if neither matches.
async function findOrCreateGoogleUser({ sub, email: rawEmail, emailVerified, picture }) {
    const email = rawEmail ? rawEmail.trim().toLowerCase() : rawEmail;
    const bySub = await userRepo.findByGoogleSub(sub);
    if (bySub) {
        if (!bySub.avatar_url && picture) {
            await userRepo.syncGoogleAvatar(bySub.id, picture);
            return userRepo.findByGoogleSub(sub);
        }
        return bySub;
    }

    if (emailVerified) {
        const byEmail = await userRepo.findByEmail(email);
        if (byEmail) {
            await userRepo.linkGoogleSub(byEmail.id, sub, picture);
            return userRepo.findByGoogleSub(sub);
        }
    }

    const username = await generateUsernameFromEmail(email);
    await userRepo.createGoogleUser(username, email, sub, picture);
    return userRepo.findByGoogleSub(sub);
}

// Stores an uploaded avatar's bytes directly in the database and points
// avatar_url at our own serving route (GET /account/avatar/:username) -
// never at a client-supplied path. A cache-busting query string is appended
// so the browser refetches after a change instead of serving a stale
// cached copy of the previous image from the same URL.
async function setUploadedAvatar(username, buffer, mime) {
    const avatarUrl = `/account/avatar/${encodeURIComponent(username)}?v=${Date.now()}`;
    await userRepo.setUploadedAvatarImage(username, buffer, mime, avatarUrl);
    return { ok: true, avatarUrl };
}

async function clearAvatar(username) {
    await userRepo.clearAvatar(username);
    return { ok: true, avatarUrl: null };
}

module.exports = {
    verifyUserLogin,
    signupUser,
    verifyAdminLogin,
    findOrCreateGoogleUser,
    setUploadedAvatar,
    clearAvatar,
};
