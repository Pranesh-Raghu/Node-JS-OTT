const { avatarInitial, avatarColor, gravatarUrl } = require('../lib/avatar');

function readThemeCookie(req) {
    const header = req.headers.cookie;
    if (!header) return 'dark';
    const match = header.split(';').map((c) => c.trim()).find((c) => c.startsWith('theme='));
    const value = match ? decodeURIComponent(match.slice('theme='.length)) : null;
    return value === 'light' ? 'light' : 'dark';
}

function attachViewHelpers(req, res, next) {
    res.locals.avatarInitial = avatarInitial;
    res.locals.avatarColor = avatarColor;
    res.locals.gravatarUrl = gravatarUrl;
    res.locals.theme = readThemeCookie(req);
    next();
}

module.exports = { attachViewHelpers };
