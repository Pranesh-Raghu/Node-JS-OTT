// Fetches cast/crew from TMDB for every published title that currently has
// zero title_credits rows (mostly titles added by the later catalog
// expansion passes, which pulled posters/trailers but not credits).
// Safe to re-run: listTitlesMissingCredits() only returns titles still at
// zero credits, and title_credits inserts are INSERT IGNORE.
'use strict';
require('dotenv').config();
const titleRepo = require('../src/repositories/titleRepo');
const { pool } = require('../src/db/pool');

const API_KEY = process.env.TMDB_API_KEY;
const DELAY_MS = 260; // stay well under TMDB's ~40 req/10s limit
const MAX_CAST = 8;
const MAX_CREW = 3; // directors/writers only, matches createTitle's intent

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

async function fetchCredits(tmdbId) {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/credits?api_key=${API_KEY}`);
    if (!res.ok) return { cast: [], crew: [] };
    const json = await res.json();

    const cast = (json.cast || [])
        .slice(0, MAX_CAST)
        .map((c) => ({ name: c.name, role: c.character || '' }));

    const crew = (json.crew || [])
        .filter((c) => c.job === 'Director' || c.job === 'Writer' || c.department === 'Directing')
        .slice(0, MAX_CREW)
        .map((c) => ({ name: c.name, role: c.job || '' }));

    return { cast, crew };
}

async function main() {
    const titles = await titleRepo.listTitlesMissingCredits();
    console.log(`${titles.length} published titles have no cast/crew.`);

    let updated = 0;
    let noMatch = 0;
    let noCredits = 0;

    for (const title of titles) {
        const year = extractYear(title.releaseDate);
        try {
            const results = await searchMovie(title.title, year);
            await sleep(DELAY_MS);
            const best = pickBestMatch(results, title.title, year);
            if (!best) {
                noMatch += 1;
                console.log(`NO TMDB MATCH: ${title.title} (${title.releaseDate})`);
                continue;
            }

            const { cast, crew } = await fetchCredits(best.id);
            await sleep(DELAY_MS);
            if (cast.length === 0 && crew.length === 0) {
                noCredits += 1;
                console.log(`NO CREDITS ON TMDB: ${title.title}`);
                continue;
            }

            await titleRepo.addCreditsForTitle(title.id, cast, crew);
            updated += 1;
            console.log(`OK: ${title.title} -> ${cast.length} cast, ${crew.length} crew`);
        } catch (err) {
            console.log(`ERROR: ${title.title} -> ${err.message}`);
        }
    }

    console.log('---');
    console.log(`Updated: ${updated}, no TMDB match: ${noMatch}, no credits on TMDB: ${noCredits}`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
