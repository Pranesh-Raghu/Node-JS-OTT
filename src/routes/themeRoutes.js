const express = require('express');
const { setThemeCookie } = require('../lib/theme');

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
    setThemeCookie(res, next);
    res.redirect(safeReturnPath(req.get('referer'), req));
});

module.exports = router;
