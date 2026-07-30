const express = require('express');
const { ping } = require('../db/pool');

const router = express.Router();

router.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

router.get('/readyz', async (req, res) => {
    try {
        const ok = await ping();
        if (!ok) throw new Error('unexpected ping result');
        res.status(200).json({ status: 'ok', db: 'ok' });
    } catch (err) {
        res.status(503).json({ status: 'unavailable' });
    }
});

module.exports = router;
