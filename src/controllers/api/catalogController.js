'use strict';

const catalogService = require('../../services/catalogService');

// Mirrors catalogController.movieDetails/videoPlayer, just as JSON instead
// of res.render(). The FGA guards (can_discover / can_play) are applied at
// the route layer in src/routes/apiRoutes.js with `json: true`, same as the
// SPA shell route for the same :id in src/routes/catalogRoutes.js - both
// have to independently enforce the check because the shell route and this
// data route are two separate requests.
async function getTitle(req, res, next) {
    try {
        const movie = await catalogService.getMovie(req.params.id);
        if (!movie) return res.status(404).json({ error: 'not_found', message: 'Movie not found' });
        const hasVideo = Boolean(await catalogService.getPlayable(req.params.id));
        res.json({ movie, hasVideo });
    } catch (err) {
        next(err);
    }
}

async function getPlayable(req, res, next) {
    try {
        const video = await catalogService.getPlayable(req.params.id);
        if (!video) return res.status(404).json({ error: 'not_found', message: 'Video not found' });
        res.json({ video });
    } catch (err) {
        next(err);
    }
}

// Mirrors the pagination behavior of the old catalogController.home
// (invalid/out-of-range ?page falls back to page 1 - see
// catalogService.getCatalogPage). No auth guard: the catalog itself is
// public; deviceCount/user context comes from GET /api/session instead of
// being bundled into this response, unlike the old res.render('home', ...)
// contract that carried them together.
async function getCatalogPage(req, res, next) {
    try {
        const requestedPage = parseInt(req.query.page, 10);
        const { movies, pagination } = await catalogService.getCatalogPage(requestedPage);
        res.json({ movies, pagination });
    } catch (err) {
        next(err);
    }
}

module.exports = { getTitle, getPlayable, getCatalogPage };
