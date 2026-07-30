const { OpenFgaClient } = require('@openfga/sdk');
const logger = require('../logger');

const client = new OpenFgaClient({
    apiUrl: process.env.FGA_API_URL || 'http://localhost:8080',
    storeId: process.env.FGA_STORE_ID,
    authorizationModelId: process.env.FGA_MODEL_ID,
});

// Fail-open for browse/discover (an FGA outage shouldn't take the whole
// homepage down), fail-closed for anything write/playback-related (per the
// plan's tiered fail policy — simplified here to two tiers instead of three).
async function can(user, relation, object, { failOpen = false } = {}) {
    try {
        const { allowed } = await client.check({ user, relation, object });
        return Boolean(allowed);
    } catch (err) {
        logger.error({ err, user, relation, object }, 'OpenFGA check failed');
        return failOpen;
    }
}

async function writeTuples(writes = [], deletes = []) {
    try {
        await client.write({
            writes: writes.length ? writes : undefined,
            deletes: deletes.length ? deletes : undefined,
        });
    } catch (err) {
        logger.error({ err, writes, deletes }, 'OpenFGA tuple write failed');
        throw err;
    }
}

module.exports = { client, can, writeTuples };
