const catalogService = require('../services/catalogService');
const { safeRedirect } = require('../lib/safeRedirect');

// home/movieDetails/videoPlayer were retired when '/', '/movie/:id', and
// '/video/:id' moved to React (see src/controllers/api/catalogController.js
// for their JSON equivalents, and src/routes/catalogRoutes.js for the
// route swaps).

async function searchMovies(req, res, next) {
    try {
        const movies = await catalogService.searchMovies(req.query.q);
        res.json({ movies });
    } catch (err) {
        next(err);
    }
}

// The only piece of '/watchlist' still worth a server-side function: the
// login-redirect guard in front of the SPA shell (see catalogRoutes.js).
// The page itself has no server-rendered data - it fetches
// GET /api/watchlist client-side.
function requireLoginForWatchlist(req, res, next) {
    if (!req.session.user) {
        return safeRedirect(res, undefined, '/login?redirectTo=/watchlist');
    }
    next();
}

module.exports = { requireLoginForWatchlist, searchMovies };
