const titleRepo = require('../repositories/titleRepo');
const { createTtlCache } = require('../lib/ttlCache');

// Was duplicated as a controller-local constant in both the EJS
// catalogController.home and the JSON API's catalogPage below - moved here
// so there's exactly one definition.
const PAGE_SIZE = 24;

// Performance: the catalog listing is identical for every visitor (no
// per-user personalization on this page) and was hitting Postgres - a
// COUNT and a paginated SELECT - on every single request, including
// repeat requests for the exact same page seconds apart. 60s is short
// enough that a newly-added movie (addMovie, below) shows up almost
// immediately anyway, but that path also clears this outright rather than
// waiting out the TTL, so a fresh add is never delayed by it.
const catalogPageCache = createTtlCache({ ttlMs: 60 * 1000, maxEntries: 50 });

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
    // Cache key is the raw requestedPage, including invalid/out-of-range
    // values (undefined, 0, 999999) - they all normalize to the same
    // clamped `page` below, so caching them separately would just be
    // redundant entries, not a correctness issue, but keying on the
    // already-normalized inputs keeps the cache small.
    const cacheKey = String(requestedPage ?? '');
    const cached = catalogPageCache.get(cacheKey);
    if (cached !== undefined) return cached;

    const total = await countMovies();
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= totalPages ? requestedPage : 1;
    const offset = (page - 1) * PAGE_SIZE;
    const movies = await listMoviesPage({ limit: PAGE_SIZE, offset });
    const result = { movies, pagination: { page, totalPages, hasPrev: page > 1, hasNext: page < totalPages } };
    catalogPageCache.set(cacheKey, result);
    return result;
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
    const movie = await titleRepo.createTitle({
        title,
        releaseDate,
        poster,
        cast: JSON.parse(cast),
        crew: JSON.parse(crew),
    });
    // A new title changes both the total count and every page's contents
    // from wherever it sorts onward - clearing outright is simpler and
    // cheap (at most 50 tiny cached pages) than working out exactly which
    // pages shifted.
    catalogPageCache.clear();
    return movie;
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
