const catalogService = require('../services/catalogService');
const logger = require('../logger');

async function showAdmin(req, res, next) {
    try {
        const titles = await catalogService.listForAdminSelect();
        res.render('admin', { titles });
    } catch (err) {
        next(err);
    }
}

async function addMovie(req, res, next) {
    const { title, releaseDate, poster, cast, crew } = req.body || {};
    if (!title || !releaseDate || !poster || !cast || !crew) {
        return res.status(400).send('All fields are required');
    }
    try {
        const movie = await catalogService.addMovie({ title, releaseDate, poster, cast, crew });
        logger.info({ movieId: movie.id, title: movie.title }, 'Movie added');
        res.redirect('/admin');
    } catch (err) {
        if (err instanceof SyntaxError) {
            return res.status(400).send('Invalid JSON format for cast or crew');
        }
        next(err);
    }
}

async function uploadVideo(req, res, next) {
    const { titleId, title, videoLink } = req.body || {};
    if (!titleId || !title || !videoLink) {
        return res.status(400).send('Movie, title, and video link are all required');
    }
    try {
        await catalogService.addVideo({ titleId, title, videoLink });
        res.redirect('/admin');
    } catch (err) {
        next(err);
    }
}

module.exports = { showAdmin, addMovie, uploadVideo };
