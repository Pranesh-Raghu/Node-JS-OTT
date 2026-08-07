// Shared by GET /theme/toggle (src/routes/themeRoutes.js, still used by the
// remaining EJS pages) and POST /api/theme (the React SPA) so the cookie
// options only live in one place.
const THEME_COOKIE_OPTIONS = {
    maxAge: 365 * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: 'lax',
};

function setThemeCookie(res, theme) {
    const value = theme === 'light' ? 'light' : 'dark';
    res.cookie('theme', value, THEME_COOKIE_OPTIONS);
    return value;
}

module.exports = { setThemeCookie };
