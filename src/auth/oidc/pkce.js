const crypto = require('crypto');

const VERIFIER_RE = /^[A-Za-z0-9._~-]{43,128}$/;

function isValidChallenge(challenge) {
    return typeof challenge === 'string' && VERIFIER_RE.test(challenge);
}

function verifyPkce(verifier, challenge) {
    if (typeof verifier !== 'string' || !VERIFIER_RE.test(verifier)) return false;
    const computed = crypto.createHash('sha256').update(verifier, 'ascii').digest('base64url');
    const a = Buffer.from(computed);
    const b = Buffer.from(challenge);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
}

module.exports = { isValidChallenge, verifyPkce };
