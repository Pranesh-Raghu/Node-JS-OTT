// Thin fetch wrapper shared by every API call the SPA makes.
//
// CSRF: src/middleware/csrf.js reads the token from the `x-csrf-token`
// header (already supported server-side, no change needed there). The
// token is seeded from GET /api/session and kept in a module-level
// variable, not React state - every caller of apiFetch needs it and it
// changes rarely, so a context round-trip would be pure overhead.
let csrfToken = null;

export function setCsrfToken(token) {
    csrfToken = token;
}

export class ApiError extends Error {
    constructor(status, code, message) {
        super(message || code || `Request failed with status ${status}`);
        this.status = status;
        this.code = code;
    }
}

const JSON_METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// `attempt` distinguishes the original call from the one CSRF-desync retry
// below - without it a second 403 would retry forever.
async function apiFetch(path, { method = 'GET', body, headers, ...rest } = {}, attempt = 0) {
    const isBodyMethod = JSON_METHODS_WITH_BODY.has(method) && body !== undefined && !(body instanceof FormData);
    const res = await fetch(path, {
        method,
        credentials: 'same-origin',
        headers: {
            ...(isBodyMethod ? { 'Content-Type': 'application/json' } : {}),
            ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
            ...headers,
        },
        body: isBodyMethod ? JSON.stringify(body) : body,
        ...rest,
    });

    if (res.status === 401) {
        // A redirect from fetch() is followed transparently and would land
        // here as a 200 with login HTML, not a 401 - so /api/* guards
        // (src/middleware/requireApiAuth.js) always return JSON 401
        // instead of redirecting. This is the one place that turns it back
        // into a real browser navigation, exactly like the pre-migration
        // EJS redirect-to-login behavior. Full navigation, not React
        // Router - /login stays an EJS page, not a SPA route.
        window.location.assign(`/login?redirectTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
        // Navigation is async; throw so callers don't try to read a body.
        throw new ApiError(401, 'unauthenticated', 'Redirecting to login');
    }

    let payload = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        payload = await res.json().catch(() => null);
    }

    if (res.status === 403 && payload?.code === 'EBADCSRFTOKEN' && attempt === 0) {
        // req.session.regenerate() (login, signup, Google callback, self-
        // revoke) rotates the csrf-sync secret. If this tab's token was
        // issued before that happened in another tab, refetch a fresh one
        // and retry exactly once - no loop.
        const session = await apiFetch('/api/session');
        setCsrfToken(session.csrfToken);
        return apiFetch(path, { method, body, headers, ...rest }, attempt + 1);
    }

    if (!res.ok) {
        throw new ApiError(res.status, payload?.error, payload?.message);
    }
    return payload;
}

export const api = {
    get: (path) => apiFetch(path),
    post: (path, body) => apiFetch(path, { method: 'POST', body }),
    patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
    delete: (path, body) => apiFetch(path, { method: 'DELETE', body }),
    // Multipart bodies (avatar upload): skip JSON stringification/headers,
    // send the FormData as-is. CSRF still works because the token travels
    // as a header, sidestepping the multipart body-parsing ordering issue
    // that avatarUploadMiddleware's placement in src/app.js works around.
    postForm: (path, formData) => apiFetch(path, { method: 'POST', body: formData }),
};
