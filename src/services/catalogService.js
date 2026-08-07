const titleRepo = require('../repositories/titleRepo');

// Was duplicated as a controller-local constant in both the EJS
// catalogController.home and the JSON API's catalogPage below - moved here
// so there's exactly one definition.
const PAGE_SIZE = 24;

async function listMoviesPage({ limit, offset }) {
    return titleRepo.listPublished({ limit, offset });
}

async function countMovies() {
    return titleRepo.countPublished();
}

// Shared pagination math for the home page - used by the JSON API
// (src/controllers/api/catalogController.js) and, until it's retired, the
// legacy EJS controller (src/controllers/catalogController.js).
async function getCatalogPage(requestedPage) {
    const total = await countMovies();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= totalPages ? requestedPage : 1;
    const offset = (page - 1) * PAGE_SIZE;
    const movies = await listMoviesPage({ limit: PAGE_SIZE, offset });
    return { movies, pagination: { page, totalPages, hasPrev: page > 1, hasNext: page < totalPages } };
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

module.exports = {
    listMoviesPage,
    countMovies,
    getCatalogPage,
    searchMovies,
    getMovie,
    getPlayable,
    addMovie,
    addVideo,
    listForAdminSelect,
};
