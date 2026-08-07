// Adds titles.logo_url so the movie details page can show the official
// title treatment/logo (e.g. the stylized "THE DARK KNIGHT RISES" bat-logo)
// instead of plain text, when TMDB has one. See scripts/fetch-title-logos.js
// for the backfill. Nullable and NOT backfilled by this migration - same
// pattern as imdb_rating (migration 20260807000003_imdb_ratings.js): most
// titles won't have a matching logo image, and the UI falls back to the
// plain text title when this is null.
exports.up = async function up(knex) {
    await knex.raw(`
        ALTER TABLE titles
        ADD COLUMN logo_url VARCHAR(2048) NULL;
    `);
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE titles DROP COLUMN IF EXISTS logo_url');
};
