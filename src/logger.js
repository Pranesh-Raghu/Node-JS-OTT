const pino = require('pino');
const config = require('./config');

const logger = pino({
    level: config.LOG_LEVEL,
    redact: {
        paths: [
            'req.headers.cookie',
            'req.headers.authorization',
            'req.body.password',
            'req.body.confirmPassword',
            '*.password',
            '*.password_hash',
            '*.secret',
            '*.token',
        ],
        censor: '[redacted]',
    },
    transport: config.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

module.exports = logger;
