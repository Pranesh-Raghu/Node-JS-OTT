// Google's userinfo response (requested via the `profile` scope) includes a
// `picture` field with the user's actual Google account photo. Previously
// this was fetched and thrown away entirely, so Google-linked accounts fell
// straight through to Gravatar (usually unregistered for a random address)
// and then the initial-letter fallback, even though a real picture was
// available the whole time.
exports.up = async function up(knex) {
    const hasColumn = async (table, column) => {
        const [rows] = await knex.raw(
            `SELECT COUNT(*) AS cnt FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
            [table, column]
        );
        return rows[0].cnt > 0;
    };

    if (!(await hasColumn('users', 'avatar_url'))) {
        await knex.raw('ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512) NULL');
    }
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE users DROP COLUMN avatar_url');
};
