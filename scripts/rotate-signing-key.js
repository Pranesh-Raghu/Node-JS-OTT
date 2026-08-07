// One-off operator script: generates a new OAuth 2.1 access-token signing
// key, demotes the current one to 'retiring' (kept, not deleted - already-
// issued 10-minute access tokens signed with it must keep verifying until
// they naturally expire), and makes the new one 'current'. Not run
// automatically by anything - deliberate key rotation is an operator
// decision, not a cron job's.
//
// A running server picks up the new 'current' key within
// KEY_CACHE_TTL_MS (5 minutes, see src/auth/oidc/keys.js) without needing
// a restart - this script runs as a separate process, so it can't clear
// that in-memory cache directly.
'use strict';
require('dotenv').config();
const { rotateSigningKey } = require('../src/auth/oidc/keys');
const { pool } = require('../src/db/pool');

async function main() {
    const kid = await rotateSigningKey();
    console.log(`Rotated signing key. New current kid: ${kid}`);
    console.log('Running servers will pick this up within 5 minutes, or immediately on restart.');
}

main()
    .catch((err) => {
        console.error('Signing key rotation failed:', err);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
