// Fetches real posters and official YouTube trailer keys from TMDB for
// every movie in data.json. Idempotent-ish: re-running will re-fetch and
// overwrite poster/trailer fields, so it's safe to run again after adding
// new movies.
'use strict';
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const API_KEY = process.env.TMDB_API_KEY;
const POSTER_SIZE = 'w780';
const DELAY_MS = 260; // stay well under TMDB's ~40 req/10s limit

if (!API_KEY) {
    console.error('TMDB_API_KEY is not set in .env');
    process.exit(1);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractYear(releaseDate) {
    const m = String(releaseDate).match(/(\d{4})/);
    return m ? m[1] : null;
}

async function searchMovie(title, year) {
    const params = new URLSearchParams({ api_key: API_KEY, query: title });
    if (year) params.set('year', year);
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`);
    if (!res.ok) throw new Error(`TMDB search failed: ${res.status}`);
    const json = await res.json();
    return json.results || [];
}

function pickBestMatch(results, title, year) {
    if (results.length === 0) return null;
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const targetNorm = norm(title);

    // Prefer an exact (normalized) title match closest to the target year.
    const exactTitleMatches = results.filter((r) => norm(r.title) === targetNorm);
    const pool = exactTitleMatches.length > 0 ? exactTitleMatches : results;

    if (year) {
        pool.sort((a, b) => {
            const ay = extractYear(a.release_date) || '0';
            const by = extractYear(b.release_date) || '0';
            return Math.abs(Number(ay) - Number(year)) - Math.abs(Number(by) - Number(year));
        });
    }
    return pool[0];
}

async function fetchTrailerKey(tmdbId) {
    const res = await fetch(
        `https://api.themoviedb.org/3/movie/${tmdbId}/videos?api_key=${API_KEY}`
    );
    if (!res.ok) return null;
    const json = await res.json();
    const videos = json.results || [];
    const trailer =
        videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
        videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
        videos.find((v) => v.site === 'YouTube');
    return trailer ? trailer.key : null;
}

async function main() {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));

    let postersUpdated = 0;
    let trailersFound = 0;
    let noMatch = 0;

    for (const movie of data.movies) {
        const year = extractYear(movie.releaseDate);
        try {
            const results = await searchMovie(movie.title, year);
            await sleep(DELAY_MS);
            const best = pickBestMatch(results, movie.title, year);

            if (!best) {
                noMatch += 1;
                console.log(`NO MATCH: ${movie.title} (${movie.releaseDate})`);
                continue;
            }

            if (best.poster_path) {
                movie.poster = `https://image.tmdb.org/t/p/${POSTER_SIZE}${best.poster_path}`;
                postersUpdated += 1;
            }

            const trailerKey = await fetchTrailerKey(best.id);
            await sleep(DELAY_MS);
            if (trailerKey) {
                movie.trailerYoutubeKey = trailerKey;
                trailersFound += 1;
            }
        } catch (err) {
            console.log(`ERROR: ${movie.title} -> ${err.message}`);
        }
    }

    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log('---');
    console.log(`Posters updated: ${postersUpdated}`);
    console.log(`Trailers found: ${trailersFound}`);
    console.log(`No TMDB match: ${noMatch}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
