const express = require('express');

const router = express.Router();

function safeReturnPath(referer, req) {
    if (!referer) return '/';
    try {
        const url = new URL(referer);
        const sameOrigin = url.protocol === req.protocol + ':' && url.host === req.get('host');
        return sameOrigin ? url.pathname + url.search : '/';
    } catch {
        return '/';
    }
}

router.get('/theme/toggle', (req, res) => {
    const next = res.locals.theme === 'light' ? 'dark' : 'light';
    res.cookie('theme', next, {
        maxAge: 365 * 24 * 60 * 60 * 1000,
        httpOnly: false,
        sameSite: 'lax',
    });
    res.redirect(safeReturnPath(req.get('referer'), req));
});

module.exports = router;
