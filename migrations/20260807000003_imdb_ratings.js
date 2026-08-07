// Adds IMDB rating data so the catalog can be sorted by it (highest first)
// instead of release date. Nullable and NOT backfilled by this migration -
// see scripts/fetch-imdb-ratings.js, which populates both columns from the
// OMDb API (the API that actually serves IMDB's own rating data; TMDB's
// vote_average is a different, unrelated rating). imdb_id is stored
// alongside the rating (not just the number) so a future re-run can look
// titles up by IMDB id directly instead of by title+year, which is exact
// where a title+year match can be ambiguous.
exports.up = async function up(knex) {
    await knex.raw(`
        ALTER TABLE titles
        ADD COLUMN imdb_id VARCHAR(15) NULL,
        ADD COLUMN imdb_rating NUMERIC(3,1) NULL CHECK (imdb_rating IS NULL OR (imdb_rating >= 0 AND imdb_rating <= 10));
    `);
    // Sparse partial index: only rows with a rating are ever sorted by it
    // (see titleRepo.listPublished's NULLS LAST clause), so indexing the
    // NULL majority before the backfill runs would just be dead weight.
    await knex.raw(`
        CREATE INDEX ix_titles_imdb_rating ON titles (imdb_rating DESC) WHERE imdb_rating IS NOT NULL;
    `);
};

exports.down = async function down(knex) {
    await knex.raw('DROP INDEX IF EXISTS ix_titles_imdb_rating');
    await knex.raw('ALTER TABLE titles DROP COLUMN IF EXISTS imdb_rating, DROP COLUMN IF EXISTS imdb_id');
};
