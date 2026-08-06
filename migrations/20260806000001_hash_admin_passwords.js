// Security fix: `admins.password` was stored and compared as plaintext
// (see the removed TODO(security) in src/repositories/adminRepo.js). This
// migrates every existing row to a bcrypt hash in place, matching how the
// `accounts`/`users` password columns already work. Idempotent - a bcrypt
// hash always starts with `$2`, so a re-run skips rows already migrated.
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;
const BCRYPT_HASH_RE = /^\$2[aby]?\$/;

exports.up = async function up(knex) {
    const { rows } = await knex.raw('SELECT id, password FROM admins');
    for (const admin of rows) {
        if (BCRYPT_HASH_RE.test(admin.password)) continue;
        // eslint-disable-next-line no-await-in-loop -- small, one-time admin table
        const hashed = await bcrypt.hash(admin.password, SALT_ROUNDS);
        // eslint-disable-next-line no-await-in-loop
        await knex.raw('UPDATE admins SET password = ? WHERE id = ?', [hashed, admin.id]);
    }
};

exports.down = async function down() {
    // Not reversible: the original plaintext values can't be recovered
    // from their bcrypt hashes, and leaving them hashed is strictly safer
    // than restoring plaintext, so this migration has no down path.
    throw new Error('20260806000001_hash_admin_passwords is not reversible');
};
