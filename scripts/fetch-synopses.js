// Backfills titles.synopsis from the OMDb API (same source and lookup
// strategy as scripts/fetch-imdb-ratings.js - OMDb's `Plot` field, short
// form, is exactly the "premise" text this catalog was missing).
//
// Idempotent and resumable: skips any title that already has a synopsis,
// so it's safe to re-run - same reasoning as fetch-imdb-ratings.js re:
// OMDb's free tier capping at 1,000 requests/day.
'use strict';
require('dotenv').config();
const { pool } = require('../src/db/pool');

const API_KEY = process.env.OMDB_API_KEY;
const DELAY_MS = 100; // OMDb has no published rate limit, but avoid hammering it regardless
const DAILY_REQUEST_CAP = 950; // stay under the free tier's 1,000/day with a small safety margin

if (!API_KEY) {
    console.error('OMDB_API_KEY is not set in .env - sign up for a free key at https://www.omdbapi.com/apikey.aspx');
    process.exit(1);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractYear(releaseDate) {
    const m = String(releaseDate).match(/(\d{4})/);
    return m ? m[1] : null;
}

async function omdbLookup(title, year) {
    // plot=short keeps this a one-line premise, not OMDb's multi-sentence
    // "full" plot - matches what a catalog listing needs, not a recap.
    const params = new URLSearchParams({ apikey: API_KEY, t: title, type: 'movie', plot: 'short' });
    if (year) params.set('y', year);
    const res = await fetch(`https://www.omdbapi.com/?${params}`);
    if (!res.ok) throw new Error(`OMDb request failed: ${res.status}`);
    const json = await res.json();
    if (json.Response === 'False') return null;
    return json.Plot && json.Plot !== 'N/A' ? json.Plot : null;
}

// Same festival-premiere-vs-wide-release year mismatch fetch-imdb-ratings.js
// guards against (see its comment) - retry title-only before giving up,
// except for titles dated after this year (unreleased placeholders, which
// can't have a real OMDb entry - a title-only hit there is always a stale
// match on an older film of the same name, per Ghost Rider's history).
async function lookupByTitleAndYear(title, year) {
    const exact = await omdbLookup(title, year);
    if (exact) return exact;
    if (!year || Number(year) > new Date().getFullYear()) return null;
    return omdbLookup(title, null);
}

async function main() {
    const [titles] = await pool.execute(
        'SELECT id, title, release_date FROM titles WHERE synopsis IS NULL AND deleted_at IS NULL ORDER BY id ASC'
    );
    console.log(`${titles.length} titles missing a synopsis.`);

    let updated = 0;
    let notFound = 0;
    let requestCount = 0;

    for (const t of titles) {
        if (requestCount >= DAILY_REQUEST_CAP) {
            console.log(`Hit the ${DAILY_REQUEST_CAP}-request safety cap for this run - re-run tomorrow to continue.`);
            break;
        }

        // eslint-disable-next-line no-await-in-loop -- deliberately sequential, see DELAY_MS
        const plot = await lookupByTitleAndYear(t.title, extractYear(t.release_date));
        requestCount += 1;

        if (!plot) {
            notFound += 1;
            console.log(`  no synopsis found: "${t.title}"`);
        } else {
            // eslint-disable-next-line no-await-in-loop
            await pool.execute('UPDATE titles SET synopsis = ? WHERE id = ?', [plot, t.id]);
            updated += 1;
        }

        // eslint-disable-next-line no-await-in-loop
        await sleep(DELAY_MS);
    }

    console.log(`Updated ${updated} titles, ${notFound} had no OMDb match, ${requestCount} requests used.`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
