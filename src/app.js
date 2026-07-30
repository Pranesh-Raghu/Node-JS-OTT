const path = require('path');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const pinoHttp = require('pino-http');

const config = require('./config');
const logger = require('./logger');
const { pool } = require('./db/pool');
const authRoutes = require('./routes/authRoutes');
const catalogRoutes = require('./routes/catalogRoutes');
const adminRoutes = require('./routes/adminRoutes');
const healthRoutes = require('./routes/healthRoutes');
const accountRoutes = require('./routes/accountRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { csrfSynchronisedProtection, attachCsrfToken } = require('./middleware/csrf');
const { globalLimiter, authLimiter } = require('./middleware/rateLimit');
const { trackSessionDevice } = require('./middleware/trackSessionDevice');
const { attachViewHelpers } = require('./middleware/locals');
const oauthRoutes = require('./auth/oidc/routes');
const mcpRouter = require('./mcp/server');
const themeRoutes = require('./routes/themeRoutes');

function createApp() {
    const app = express();

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, '..', 'views'));
    app.set('trust proxy', config.NODE_ENV === 'production' ? 1 : false);

    app.use(
        pinoHttp({
            logger,
            autoLogging: {
                ignore: (req) => req.url === '/healthz' || req.url === '/readyz',
            },
        })
    );

    // CSP allowlists the actual third-party media this app embeds:
    // TMDB poster images, legacy Firebase-hosted posters, Cloudinary-hosted
    // video files, and YouTube trailer iframes. style-src keeps
    // 'unsafe-inline' for now because some inline style="" attributes are
    // still being removed in a parallel cleanup pass; tighten once that
    // lands (see the frontend hardening phase).
    app.use(
        helmet({
            contentSecurityPolicy: {
                directives: {
                    ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                    'img-src': ["'self'", 'data:', 'https://image.tmdb.org', 'https://firebasestorage.googleapis.com', 'https://placehold.co', 'https://img.youtube.com', 'https://www.gravatar.com'],
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

    const sessionStore = new MySQLStore({}, pool);

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
    app.use(attachCsrfToken);
    app.use(csrfSynchronisedProtection);
    app.use(trackSessionDevice);
    app.use(attachViewHelpers);
    app.use('/', themeRoutes);

    app.use('/', healthRoutes);
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
