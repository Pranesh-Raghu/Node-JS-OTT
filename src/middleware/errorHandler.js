const logger = require('../logger');

function notFound(req, res) {
    res.status(404).send('Not found');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
    if (res.headersSent) return;

    const status = err.status || err.statusCode || 500;
    const isApi = req.path.startsWith('/api/');
    const csrfMessage = 'Your form session expired. Please go back and try again.';

    if (status === 403 && err.code === 'EBADCSRFTOKEN') {
        // client/src/lib/api.js keys off `code` (not `error`) to trigger its
        // one-shot session-refetch-and-retry - see the comment there on why
        // a regenerated session desyncs a tab's held CSRF token.
        if (isApi) return res.status(403).json({ error: 'invalid_csrf_token', code: 'EBADCSRFTOKEN', message: csrfMessage });
        return res.status(403).send(csrfMessage);
    }
    if (status >= 400 && status < 500) {
        const message = err.message || 'Request could not be processed.';
        if (isApi) return res.status(status).json({ error: err.error || 'request_error', message });
        return res.status(status).send(message);
    }
    if (isApi) return res.status(500).json({ error: 'internal_error', message: 'Something went wrong. Please try again.' });
    res.status(500).send('Something went wrong. Please try again.');
}

module.exports = { notFound, errorHandler };
