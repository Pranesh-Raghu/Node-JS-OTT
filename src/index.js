const config = require('./config');
const logger = require('./logger');
const { createApp } = require('./app');
const { pool } = require('./db/pool');
const { deliverPendingWebhooks } = require('./webhooks/deliver');

const app = createApp();
const server = app.listen(config.PORT, () => {
    logger.info(`Server listening on http://localhost:${config.PORT}`);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Not a general job queue -- just a periodic poll of due webhook_deliveries
// rows. See src/webhooks/deliver.js for the retry/backoff/circuit-breaker
// logic.
const webhookDeliveryInterval = setInterval(() => {
    deliverPendingWebhooks().catch((err) => {
        logger.error({ err }, 'webhook delivery sweep failed');
    });
}, 30_000);
webhookDeliveryInterval.unref();

let shuttingDown = false;

async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);
    clearInterval(webhookDeliveryInterval);

    server.close(async (err) => {
        if (err) {
            logger.error({ err }, 'Error while closing HTTP server');
        }
        try {
            await pool.end();
        } catch (poolErr) {
            logger.error({ err: poolErr }, 'Error while closing DB pool');
        }
        process.exit(err ? 1 : 0);
    });

    setTimeout(() => {
        logger.warn('Forcing shutdown after timeout');
        process.exit(1);
    }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled promise rejection');
});
process.on('uncaughtException', (err) => {
    logger.error({ err }, 'Uncaught exception');
    process.exit(1);
});
