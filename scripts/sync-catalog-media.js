// Updates poster_url / trailer_youtube_key on already-migrated `titles` rows
// from the current data.json (used after seed-catalog.js has already run,
// to pick up TMDB-fetched media without re-inserting titles).
'use strict';
require('dotenv').config();
const { pool } = require('../src/db/pool');

async function main() {
    const data = require('../data.json');
    let updated = 0;

    for (const movie of data.movies) {
        const [result] = await pool.execute(
            'UPDATE titles SET poster_url = ?, trailer_youtube_key = ? WHERE legacy_id = ?',
            [movie.poster, movie.trailerYoutubeKey || null, movie.id]
        );
        if (result.affectedRows > 0) updated += 1;
    }

    console.log(`Synced media for ${updated} titles.`);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
