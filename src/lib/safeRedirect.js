// Security: only allow redirecting to a same-app relative path, never an
// absolute URL or protocol-relative URL. Without this, a `redirectTo`-style
// param is an open redirect (e.g. `?redirectTo=//evil.example` or a full
// `https://` URL) usable for phishing off the back of a trusted login page.
function isSafeRedirectTarget(target) {
    return (
        typeof target === 'string' &&
        target.length > 0 &&
        target.length < 512 &&
        /^\/(?!\/|\\)[A-Za-z0-9\-._~/]*$/.test(target)
    );
}

function safeRedirect(res, target, fallback = '/') {
    return res.redirect(isSafeRedirectTarget(target) ? target : fallback);
}

module.exports = { safeRedirect, isSafeRedirectTarget };
