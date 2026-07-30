exports.up = async function up(knex) {
    await knex.raw(`
        ALTER TABLE titles
        ADD COLUMN trailer_youtube_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL AFTER poster_url;
    `);
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE titles DROP COLUMN trailer_youtube_key');
};
