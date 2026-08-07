// .mjs (not .js): package.json has no "type": "module" and the server is
// CommonJS throughout, so a plain vite.config.js would be parsed as CJS by
// Node and fail.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PORT for the dev proxy target - not a build-time constant, so read it at
// config-eval time rather than hardcoding 1000.
const backendPort = process.env.PORT || 1000;
const backendOrigin = `http://localhost:${backendPort}`;

export default defineConfig({
    root: 'client',
    // Matches app.use('/public', express.static(...)) in src/app.js - the
    // build output lands under the app's EXISTING static mount, so no new
    // Express route or mount is needed to serve it.
    base: '/public/app/',
    plugins: [react()],
    build: {
        outDir: '../public/app',
        emptyOutDir: true,
        // CSP-critical: src/app.js's helmet config uses the DEFAULT
        // script-src ('self', no 'unsafe-inline'). Vite's default
        // modulepreload polyfill is injected as an INLINE <script> in the
        // built index.html, which that CSP blocks outright - a silent
        // white page in production that never reproduces in `vite dev`
        // (the dev server sends no CSP header at all). Modern evergreen
        // browsers support modulepreload natively, so the polyfill costs
        // nothing to drop. Do NOT add @vitejs/plugin-legacy either - it
        // injects several more inline scripts for the same reason.
        modulePreload: { polyfill: false },
    },
    server: {
        port: 5173,
        // Cookies are set for the host, not the (host, port) pair, so
        // ctv.sid/theme set by Express on :PORT are still sent by the
        // browser to requests against :5173 - the proxy just forwards them
        // on to Express and relays Set-Cookie back. No CORS needed.
        proxy: {
            '/api': { target: backendOrigin },
            '/public': { target: backendOrigin },
            // Must be listed separately from /account/{profile,sessions,
            // webhooks} below (which are NOT proxied - they're SPA routes)
            // since this is an <img src> target served by Express, never
            // a client-side route.
            '/account/avatar': { target: backendOrigin },
            '/login': { target: backendOrigin },
            '/signup': { target: backendOrigin },
            '/logout': { target: backendOrigin },
            '/auth': { target: backendOrigin },
            '/theme': { target: backendOrigin },
            '/admin/login': { target: backendOrigin },
            '/admin/logout': { target: backendOrigin },
            '/oauth': { target: backendOrigin },
            '/.well-known': { target: backendOrigin },
            '/mcp': { target: backendOrigin },
            '/healthz': { target: backendOrigin },
            '/readyz': { target: backendOrigin },
        },
    },
});
