// Serves the built React shell (public/app/index.html, produced by
// `vite build` per vite.config.mjs) for every SPA route. Read once at
// module load and cached, since re-reading the same file on every request
// buys nothing in production - `require`'d fresh in development so
// `vite build` output picked up during `node --watch` doesn't need a
// process restart.
const fs = require('fs');
const path = require('path');

const SHELL_PATH = path.join(__dirname, '..', '..', 'public', 'app', 'index.html');

function readShell() {
    try {
        return fs.readFileSync(SHELL_PATH, 'utf8');
    } catch (err) {
        // Fail loudly at the point of use rather than 500ing per request -
        // a missing build looks identical to "the process didn't run
        // `npm run build`", which should never reach a health check as a
        // mysterious runtime error.
        throw new Error(`SPA bundle not found at ${SHELL_PATH} - run \`npm run build\` first. (${err.message})`);
    }
}

// Fail at boot, not on the first request - read (and cache) immediately in
// production. In development, re-read per call instead, so a `vite build`
// during `node --watch` doesn't need a process restart to pick up.
const cachedShell = process.env.NODE_ENV === 'production' ? readShell() : null;

function shellFor(theme) {
    const html = cachedShell || readShell();
    // client/index.html ships a placeholder data-theme="dark" (see the
    // comment there) - swap it for the real value from the `theme` cookie
    // so the correct theme is present in the first byte. No inline
    // <script> needed, so this needs no CSP change (script-src stays
    // 'self' with no 'unsafe-inline').
    return html.replace('data-theme="dark"', `data-theme="${theme === 'light' ? 'light' : 'dark'}"`);
}

function serveSpa(req, res) {
    // The shell itself is not cacheable (it embeds the visitor's current
    // theme), but every asset it references is content-hashed by Vite and
    // already effectively immutable - this only concerns the shell.
    res.set('Cache-Control', 'no-store');
    res.type('html').send(shellFor(res.locals.theme));
}

module.exports = { serveSpa };
