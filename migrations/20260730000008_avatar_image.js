// Uploaded profile pictures are stored as bytes directly in the database
// (avatar_image/avatar_mime) rather than on local disk - Render's web
// service filesystem is ephemeral and wipes local files on every redeploy
// or restart. avatar_url still holds the URL a client should <img src=""> -
// for an upload, that's our own /account/avatar/:username route rather
// than a Gravatar/Google URL.
//
// No-op for a freshly created Postgres database - migration 0001 already
// creates `users` with avatar_image/avatar_mime.
exports.up = async function up(knex) {
    const hasColumn = async (table, column) => {
        const { rows } = await knex.raw(
            `SELECT COUNT(*) AS cnt FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
            [table, column]
        );
        return Number(rows[0].cnt) > 0;
    };

    if (!(await hasColumn('users', 'avatar_image'))) {
        await knex.raw('ALTER TABLE users ADD COLUMN avatar_image BYTEA NULL');
    }
    if (!(await hasColumn('users', 'avatar_mime'))) {
        await knex.raw('ALTER TABLE users ADD COLUMN avatar_mime VARCHAR(50) NULL');
    }
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS avatar_mime');
    await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS avatar_image');
};
