// Backfills titles.imdb_id / imdb_rating from the OMDb API (the API that
// actually serves IMDB's own rating data - not to be confused with TMDB's
// unrelated vote_average, which this app already uses for posters/
// trailers via fetch-tmdb-media.js/sync-catalog-media.js).
//
// Idempotent and resumable: skips any title that already has imdb_rating
// set, so it's safe to re-run - useful given OMDb's free tier caps at
// 1,000 requests/day, which this catalog could plausibly exceed in one run
// as it grows. Re-running later just picks up wherever it left off.
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

// OMDb returns rating as a string ("7.4" or "N/A" if unrated yet) - "N/A"
// must map to null, not the NaN a bare parseFloat("N/A") would produce.
function parseRating(raw) {
    if (!raw || raw === 'N/A') return null;
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : null;
}

async function omdbLookup(title, year) {
    const params = new URLSearchParams({ apikey: API_KEY, t: title, type: 'movie' });
    if (year) params.set('y', year);
    const res = await fetch(`https://www.omdbapi.com/?${params}`);
    if (!res.ok) throw new Error(`OMDb request failed: ${res.status}`);
    const json = await res.json();
    if (json.Response === 'False') return null;
    return { imdbId: json.imdbID || null, rating: parseRating(json.imdbRating) };
}

// Our release_date sometimes reflects a festival premiere while OMDb's
// canonical Year is the wide-release year (e.g. "V for Vendetta":
// 2005-12-11 here, 2006 on OMDb) - an exact year match then finds nothing.
// Retry once, title-only, before giving up - OMDb's `t=` lookup returns
// its single best match rather than a list, so this can't introduce
// ambiguity the year filter was guarding against.
async function lookupByTitleAndYear(title, year) {
    const exact = await omdbLookup(title, year);
    if (exact) return exact;
    if (!year) return null;
    return omdbLookup(title, null);
}

async function main() {
    const [titles] = await pool.execute(
        "SELECT id, title, release_date FROM titles WHERE imdb_rating IS NULL AND deleted_at IS NULL ORDER BY id ASC"
    );
    console.log(`${titles.length} titles missing an IMDB rating.`);

    let updated = 0;
    let notFound = 0;
    let requestCount = 0;

    for (const t of titles) {
        if (requestCount >= DAILY_REQUEST_CAP) {
            console.log(`Hit the ${DAILY_REQUEST_CAP}-request safety cap for this run - re-run tomorrow to continue.`);
            break;
        }

        // eslint-disable-next-line no-await-in-loop -- deliberately sequential, see DELAY_MS
        const match = await lookupByTitleAndYear(t.title, extractYear(t.release_date));
        requestCount += 1;

        if (!match || match.rating === null) {
            notFound += 1;
            console.log(`  no rating found: "${t.title}"`);
        } else {
            // eslint-disable-next-line no-await-in-loop
            await pool.execute('UPDATE titles SET imdb_id = ?, imdb_rating = ? WHERE id = ?', [match.imdbId, match.rating, t.id]);
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
