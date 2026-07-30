const titleRepo = require('../repositories/titleRepo');

async function listMoviesPage({ limit, offset }) {
    return titleRepo.listPublished({ limit, offset });
}

async function countMovies() {
    return titleRepo.countPublished();
}

async function searchMovies(query) {
    const trimmed = (query || '').trim();
    if (!trimmed) return [];
    return titleRepo.searchPublished(trimmed, { limit: 30 });
}

async function getMovie(id) {
    return titleRepo.findById(id);
}

async function getPlayable(id) {
    return titleRepo.findPlayableById(id);
}

async function addMovie({ title, releaseDate, poster, cast, crew }) {
    return titleRepo.createTitle({
        title,
        releaseDate,
        poster,
        cast: JSON.parse(cast),
        crew: JSON.parse(crew),
    });
}

async function addVideo({ titleId, title, videoLink }) {
    return titleRepo.createVideoAsset({ titleId, label: title, src: videoLink });
}

async function listForAdminSelect() {
    return titleRepo.listForAdminSelect();
}

module.exports = { listMoviesPage, countMovies, searchMovies, getMovie, getPlayable, addMovie, addVideo, listForAdminSelect };
