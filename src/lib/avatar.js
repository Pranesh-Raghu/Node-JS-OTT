const crypto = require('crypto');

// Deterministic color + initial letter for a username-based avatar, so the
// same user always gets the same color without storing one.
const PALETTE = ['#ff4500', '#2e7d32', '#1565c0', '#6a1b9a', '#ef6c00', '#00838f', '#ad1457'];

function hashToIndex(str, mod) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
        hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    }
    return hash % mod;
}

function avatarInitial(username) {
    return (username || '?').trim().charAt(0).toUpperCase() || '?';
}

function avatarColor(username) {
    return PALETTE[hashToIndex(username || '', PALETTE.length)];
}

// Gravatar identifies images by an MD5 hash of the trimmed, lowercased
// email — MD5 here is just Gravatar's addressing scheme, not a security
// use, so its weakness as a cryptographic hash is irrelevant.
function gravatarUrl(email, size = 200) {
    if (!email) return null;
    const normalized = email.trim().toLowerCase();
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    // d=404 makes Gravatar return an actual 404 when the user has no
    // registered image, so the client can detect "no picture" and fall
    // back to the initial-letter avatar instead of showing Gravatar's
    // generic mystery-person default.
    return `https://www.gravatar.com/avatar/${hash}?d=404&s=${size}`;
}

module.exports = { avatarInitial, avatarColor, gravatarUrl };
