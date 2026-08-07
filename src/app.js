const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgSessionStore = require('connect-pg-simple')(session);
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./logger');
const { rawPool } = require('./db/pool');
const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const adminRoutes = require('./routes/adminRoutes');
const healthRoutes = require('./routes/healthRoutes');
const accountRoutes = require('./routes/accountRoutes');
const apiRoutes = require('./routes/apiRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { csrfSynchronisedProtection, attachCsrfToken } = require('./middleware/csrf');
const { globalLimiter, authLimiter } = require('./middleware/rateLimit');
const { trackSessionDevice } = require('./middleware/trackSessionDevice');
const { attachViewHelpers } = require('./middleware/locals');
const { avatarUploadMiddleware } = require('./middleware/avatarUpload');
const oauthRoutes = require('./auth/oidc/routes');
const mcpRouter = require('./mcp/server');
const themeRoutes = require('./routes/themeRoutes');

function createApp() {
    const app = express();

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    // 'loopback, linklocal, uniquelocal' (not a bare hop count, and never
    // `true`) - Render's actual proxy chain has more than one internal hop,
    // so `trust proxy: 1` was resolving req.ip to Render's own private
    // address (10.x.x.x) instead of the real visitor, which is why every
    // session_devices row showed "Local network" regardless of where the
    // visitor actually was. This preset trusts any hop whose address falls
    // in a private/loopback/link-local range as an internal proxy - however
    // many of those there are - and takes the first non-private address in
    // X-Forwarded-For as the client. A spoofed X-Forwarded-For still can't
    // fake this, since an external client's packet can never appear to
    // originate from a private range at Render's edge.
    app.set('trust proxy', config.NODE_ENV === 'production' ? 'loopback, linklocal, uniquelocal' : false);

    app.use(
        pinoHttp({
            logger,
            autoLogging: {
                ignore: (req) => req.url === '/healthz' || req.url === '/readyz',
            },
        })
    );

    // CSP allowlists the actual third-party media this app embeds. img-src
    // is broadened to any https: source rather than a fixed domain list --
    // profile pictures now come from Gravatar, Google (googleusercontent.com
    // and its several subdomains), and arbitrary user-pasted avatar URLs
    // (see account/profile), so a fixed allowlist would need constant
    // upkeep and still not cover the user-pasted case. img-src can't
    // execute script, so this doesn't open an XSS path the way a broad
    // script-src would. media-src/frame-src stay on explicit allowlists
    // since those load actual video/iframe content. style-src keeps
    // 'unsafe-inline': the EJS views' own inline style="" attributes are
    // gone now (the pages that had them moved to React - see the EJS->
    // React migration plan), but client/src/components/Avatar.jsx sets a
    // per-user background-color as an inline style the same way, so the
    // underlying need hasn't gone away, just moved. script-src stays
    // 'self' with no 'unsafe-inline'/'unsafe-eval' either way - see
    // vite.config.mjs's modulePreload.polyfill:false for why that matters.
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                    'img-src': ["'self'", 'data:', 'https:'],
                    'media-src': ["'self'", 'https://res.cloudinary.com', 'https://firebasestorage.googleapis.com', 'https://interactive-examples.mdn.mozilla.net'],
                    'frame-src': ["'self'", 'https://www.youtube.com'],
                    'style-src': ["'self'", 'https:', "'unsafe-inline'"],
                },
            },
            // helmet's default 'no-referrer' strips the Referer header on the
            // YouTube trailer iframes, which makes YouTube's embedded player
            // reject the request with "Error 153 / configuration error" since
            // it can't verify the embedding origin. This still only leaks the
            // origin (not the full path) to cross-origin destinations.
            referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        })
    );

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Security: only serve the public/ directory. Serving the repo root
    // exposed .env, data.json, server.js, and package.json over HTTP.
    app.use('/public', express.static(path.join(__dirname, '..', 'public'), { dotfiles: 'ignore' }));

    // createTableIfMissing: false - we own this table via migration 0001
    // (indexed on `expire` from the start; the library's auto-created
    // table has no such index, so its expiry sweep would full-scan).
    const sessionStore = new PgSessionStore({ pool: rawPool, tableName: 'sessions', createTableIfMissing: false });

    app.use(
        session({
            name: 'ctv.sid',
            secret: config.SESSION_SECRET,
            store: sessionStore,
            resave: false,
            saveUninitialized: false,
            cookie: {
                httpOnly: true,
                secure: config.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 1000 * 60 * 60 * 24 * 7,
            },
        })
    );

    app.use(globalLimiter);
    // Scoped to these two paths (the EJS form and its React/SPA
    // equivalent), and mounted before the CSRF check: see the comment on
    // avatarUploadMiddleware for why order matters here.
    app.use(['/account/profile', '/api/account/avatar'], avatarUploadMiddleware);
    app.use(attachCsrfToken);
    app.use(csrfSynchronisedProtection);
    app.use(trackSessionDevice);
    app.use(attachViewHelpers);
    app.use('/', themeRoutes);

    app.use('/', healthRoutes);
    app.use('/', apiRoutes);
    app.use('/', catalogRoutes);
    app.use('/login', authLimiter);
    app.use('/signup', authLimiter);
    app.use('/', authRoutes);
    app.use('/', accountRoutes);
    app.use('/admin/login', authLimiter);
    app.use('/admin', adminRoutes);
    app.use('/', oauthRoutes);
    app.use('/mcp', mcpRouter);

    app.use(notFound);
    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
