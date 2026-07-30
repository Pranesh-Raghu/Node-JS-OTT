const catalogService = require('../services/catalogService');
const { safeRedirect } = require('../lib/safeRedirect');
const sessionDeviceService = require('../services/sessionDeviceService');

const PAGE_SIZE = 24;

async function home(req, res, next) {
    try {
        const total = await catalogService.countMovies();
        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
        const requestedPage = parseInt(req.query.page, 10);
        const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= totalPages
            ? requestedPage
            : 1;
        const offset = (page - 1) * PAGE_SIZE;
        const movies = await catalogService.listMoviesPage({ limit: PAGE_SIZE, offset });

        let deviceCount = 0;
        if (req.session.user) {
            const sessions = await sessionDeviceService.listSessionsForUser(req.session.user, req.sessionID);
            deviceCount = sessions.length;
        }

        res.render('home', {
            movies,
            user: req.session.user,
            email: req.session.email,
            avatarUrl: req.session.avatarUrl,
            deviceCount,
            pagination: { page, totalPages, hasPrev: page > 1, hasNext: page < totalPages },
        });
    } catch (err) {
        next(err);
    }
}

async function movieDetails(req, res, next) {
    try {
        const movie = await catalogService.getMovie(req.params.id);
        if (!movie) return res.status(404).send('Movie not found');
        const hasVideo = Boolean(await catalogService.getPlayable(req.params.id));
        res.render('movie', { movie, hasVideo, user: req.session.user });
    } catch (err) {
        next(err);
    }
}

async function videoPlayer(req, res, next) {
    if (!req.session.user) {
        return res.redirect(`/login?redirectTo=${encodeURIComponent(`/video/${req.params.id}`)}`);
    }
    try {
        const video = await catalogService.getPlayable(req.params.id);
        if (!video) return res.status(404).send('Video not found');
        res.render('videoplayer', { video, user: req.session.user });
    } catch (err) {
        next(err);
    }
}

async function searchMovies(req, res, next) {
    try {
        const movies = await catalogService.searchMovies(req.query.q);
        res.json({ movies });
    } catch (err) {
        next(err);
    }
}

async function watchlist(req, res) {
    if (!req.session.user) {
        return safeRedirect(res, undefined, '/login?redirectTo=/watchlist');
    }
    // The watchlist itself is rendered entirely client-side from
    // localStorage (see public/Javascript/script.js) - there's no
    // server-side watchlist data to pass in.
    res.render('watchlist', { user: req.session.user });
}

module.exports = { home, movieDetails, videoPlayer, watchlist, searchMovies };
