// Also collected here for parity with production/CI: password is nullable
// for federated-only (Google) accounts, and google_sub is the stable
// matching key across logins.
//
// This is a no-op for a freshly created Postgres database (migration 0001
// already creates `users` with google_sub and a nullable password) - the
// guard below is what makes that safe, rather than erroring on a duplicate
// column/constraint.
exports.up = async function up(knex) {
    const hasColumn = async (table, column) => {
        const { rows } = await knex.raw(
            `SELECT COUNT(*) AS cnt FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?`,
            [table, column]
        );
        return Number(rows[0].cnt) > 0;
    };

    if (!(await hasColumn('users', 'google_sub'))) {
        await knex.raw('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
        await knex.raw('ALTER TABLE users ADD COLUMN google_sub VARCHAR(255) NULL');
        await knex.raw('ALTER TABLE users ADD CONSTRAINT uq_users_google_sub UNIQUE (google_sub)');
    }
};

exports.down = async function down(knex) {
    await knex.raw('ALTER TABLE users DROP CONSTRAINT IF EXISTS uq_users_google_sub');
    await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS google_sub');
    await knex.raw('ALTER TABLE users ALTER COLUMN password SET NOT NULL');
};
