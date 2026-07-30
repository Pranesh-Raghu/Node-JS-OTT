// Pure signing function, independently testable without a DB or network.
'use strict';

const crypto = require('crypto');

// HMAC-SHA256 over "{timestamp}.{rawBody}", matching the widely-used
// Stripe-style webhook signing scheme. `secret` is the raw 32-byte Buffer
// read straight out of the BINARY(32) `webhook_endpoints.secret` column --
// crypto.createHmac accepts a Buffer key directly, no .toString() needed.
function signPayload(secret, timestamp, rawBody) {
    return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

// Builds the `X-CTV-Signature: t=<unix_ts>,v1=<hex hmac>` header value.
function buildSignatureHeader(secret, rawBody, timestamp = Math.floor(Date.now() / 1000)) {
    const v1 = signPayload(secret, timestamp, rawBody);
    return `t=${timestamp},v1=${v1}`;
}

module.exports = { signPayload, buildSignatureHeader };
