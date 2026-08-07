// Backfills titles.logo_url from TMDB's per-movie /images endpoint, which
// (unlike the /search/movie poster_path used by fetch-tmdb-media.js) also
// returns transparent-background "logo" images - the official title
// treatment (e.g. the stylized "THE DARK KNIGHT RISES" bat-logo) that the
// movie details page shows in place of the plain text title when present.
//
// Idempotent and resumable: skips any title that already has a logo_url,
// so it's safe to re-run - most titles won't have an English logo on TMDB
// at all, and that's expected (the UI falls back to plain text for those).
'use strict';
require('dotenv').config();
const { pool } = require('../src/db/pool');

const API_KEY = process.env.TMDB_API_KEY;
const DELAY_MS = 260; // stay well under TMDB's ~40 req/10s limit, same as fetch-tmdb-media.js

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

// Same matching heuristic as fetch-tmdb-media.js's pickBestMatch - kept in
// sync deliberately rather than importing, since that file's function
// isn't exported and duplicating ~10 lines beats reworking a script this
// backfill doesn't otherwise depend on.
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

// Prefer an English logo (matches the site's English-only UI copy), highest
// vote_count first as TMDB's own signal for "most likely the official one"
// among multiple fan-uploaded logo variants.
async function fetchLogoUrl(tmdbId) {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}/images?api_key=${API_KEY}`);
    if (!res.ok) return null;
    const json = await res.json();
    const logos = json.logos || [];
    const english = logos.filter((l) => l.iso_639_1 === 'en' && l.file_path);
    const pool = english.length > 0 ? english : logos.filter((l) => l.file_path);
    if (pool.length === 0) return null;
    pool.sort((a, b) => b.vote_count - a.vote_count);
    return `https://image.tmdb.org/t/p/w500${pool[0].file_path}`;
}

async function main() {
    const [titles] = await pool.execute(
        'SELECT id, title, release_date FROM titles WHERE logo_url IS NULL AND deleted_at IS NULL ORDER BY id ASC'
    );
    console.log(`${titles.length} titles missing a logo.`);

    let updated = 0;
    let notFound = 0;

    for (const t of titles) {
        try {
            const year = extractYear(t.release_date);
            // eslint-disable-next-line no-await-in-loop -- deliberately sequential, see DELAY_MS
            const results = await searchMovie(t.title, year);
            // eslint-disable-next-line no-await-in-loop
            await sleep(DELAY_MS);
            const best = pickBestMatch(results, t.title, year);
            if (!best) {
                notFound += 1;
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            const logoUrl = await fetchLogoUrl(best.id);
            // eslint-disable-next-line no-await-in-loop
            await sleep(DELAY_MS);

            if (!logoUrl) {
                notFound += 1;
                continue;
            }

            // eslint-disable-next-line no-await-in-loop
            await pool.execute('UPDATE titles SET logo_url = ? WHERE id = ?', [logoUrl, t.id]);
            updated += 1;
        } catch (err) {
            console.log(`  ERROR: "${t.title}" -> ${err.message}`);
            notFound += 1;
        }
    }

    console.log(`Updated ${updated} titles, ${notFound} had no logo available.`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
