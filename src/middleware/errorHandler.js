const logger = require('../logger');

function notFound(req, res) {
    res.status(404).send('Not found');
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    logger.error({ err, path: req.path }, 'Unhandled request error');
    if (res.headersSent) return;

    const status = err.status || err.statusCode || 500;
    if (status === 403 && err.code === 'EBADCSRFTOKEN') {
        return res.status(403).send('Your form session expired. Please go back and try again.');
    }
    if (status >= 400 && status < 500) {
        return res.status(status).send(err.message || 'Request could not be processed.');
    }
    res.status(500).send('Something went wrong. Please try again.');
}

module.exports = { notFound, errorHandler };
