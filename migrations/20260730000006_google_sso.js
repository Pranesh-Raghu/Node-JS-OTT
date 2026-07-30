// Also collected here for parity with production/CI: password is nullable
// for federated-only (Google) accounts, and google_sub is the stable
// matching key across logins.
exports.up = async function up(knex) {
    const hasColumn = async (table, column) => {
        const [rows] = await knex.raw(
            `SELECT COUNT(*) AS cnt FROM information_schema.columns
             WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
            [table, column]
        );
        return rows[0].cnt > 0;
    };

    if (!(await hasColumn('users', 'google_sub'))) {
        await knex.raw('ALTER TABLE users MODIFY password VARCHAR(255) NULL');
        await knex.raw('ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL');
        await knex.raw('ALTER TABLE users ADD UNIQUE KEY uq_users_google_sub (google_sub)');
    }
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE users DROP KEY uq_users_google_sub');
    await knex.raw('ALTER TABLE users DROP COLUMN google_sub');
    await knex.raw('ALTER TABLE users MODIFY password VARCHAR(255) NOT NULL');
};
