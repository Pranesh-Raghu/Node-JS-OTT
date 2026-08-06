// Security fix: authorization-code replay detection (see
// src/auth/oidc/routes.js) denied the replayed request but never revoked
// the token family issued from the code's first (legitimate-looking) use -
// unlike the refresh-token reuse path, which does revoke on replay. To
// revoke on code replay too, the code row needs to remember which family
// it produced.
exports.up = async function up(knex) {
    await knex.raw(`
        ALTER TABLE oauth_authorization_codes
        ADD COLUMN family_id CHAR(26) NULL;
    `);
};

exports.down = async function down(knex) {
    await knex.raw(`
        ALTER TABLE oauth_authorization_codes
        DROP COLUMN family_id;
    `);
};
