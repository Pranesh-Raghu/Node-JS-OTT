const ALL_SCOPES = ['catalog:read', 'watchlist:read', 'watchlist:write'];
const DCR_ALLOWED_SCOPES = new Set(['catalog:read', 'watchlist:read', 'watchlist:write']);

function intersectScopes(requested, allowed) {
    const requestedList = requested.split(' ').filter(Boolean);
    return requestedList.filter((s) => allowed.has(s));
}

module.exports = { ALL_SCOPES, DCR_ALLOWED_SCOPES, intersectScopes };
