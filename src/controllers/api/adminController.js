'use strict';

const catalogService = require('../../services/catalogService');
const logger = require('../../logger');

async function listTitles(req, res, next) {
    try {
        const titles = await catalogService.listForAdminSelect();
        res.json({ titles });
    } catch (err) {
        next(err);
    }
}

async function addMovie(req, res, next) {
    const { title, releaseDate, poster, cast, crew } = req.body || {};
    if (!title || !releaseDate || !poster || !cast || !crew) {
        return res.status(400).json({ error: 'invalid_request', message: 'All fields are required' });
    }
    try {
        const movie = await catalogService.addMovie({ title, releaseDate, poster, cast, crew });
        logger.info({ movieId: movie.id, title: movie.title }, 'Movie added');
        res.status(201).json({ movie });
    } catch (err) {
        if (err instanceof SyntaxError) {
            return res.status(400).json({ error: 'invalid_json', message: 'Invalid JSON format for cast or crew' });
        }
        next(err);
    }
}

async function uploadVideo(req, res, next) {
    const { titleId, title, videoLink } = req.body || {};
    if (!titleId || !title || !videoLink) {
        return res.status(400).json({ error: 'invalid_request', message: 'Movie, title, and video link are all required' });
    }
    try {
        await catalogService.addVideo({ titleId, title, videoLink });
        res.status(201).json({ ok: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { listTitles, addMovie, uploadVideo };
