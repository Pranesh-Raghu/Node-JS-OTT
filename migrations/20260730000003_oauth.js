// Simplified OAuth 2.1 AS schema. Per an explicit "move fast" directive this
// skips some hardening called out in the design doc (private keys stored as
// plain JWK rather than AES-GCM-encrypted, no provisional-client throttling
// table) — those are flagged in code comments as follow-ups, not silently
// dropped.
//
// Ported to Postgres: MySQL's `PRIMARY KEY (col(255))` prefix-index syntax
// (needed there because indexing a full VARBINARY(512) column exceeds
// MySQL's index key length limits) has no Postgres equivalent, and none is
// needed - Postgres btree indexes handle these column sizes directly, so
// the primary keys below just use the full column.
exports.up = async function up(knex) {
    await knex.raw(`
        CREATE TABLE oauth_clients (
          client_id      BYTEA NOT NULL PRIMARY KEY,
          client_name    VARCHAR(128) NOT NULL,
          kind           VARCHAR(16) NOT NULL DEFAULT 'dcr' CHECK (kind IN ('dcr','cimd','static')),
          redirect_uris  JSONB NOT NULL,
          token_endpoint_auth_method VARCHAR(32) NOT NULL DEFAULT 'none' CHECK (token_endpoint_auth_method IN ('none','private_key_jwt')),
          grant_types    JSONB NOT NULL,
          scope          VARCHAR(512) NOT NULL DEFAULT 'catalog:read',
          registration_access_token_hash BYTEA NULL,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at   TIMESTAMP NULL
        );
    `);

    await knex.raw(`
        CREATE TABLE oauth_authorization_codes (
          code_hash       BYTEA NOT NULL PRIMARY KEY,
          client_id       BYTEA NOT NULL,
          account_id      BIGINT NOT NULL,
          redirect_uri    BYTEA NOT NULL,
          code_challenge  BYTEA NOT NULL,
          scope           VARCHAR(512) NOT NULL,
          resource        VARCHAR(255) NULL,
          expires_at      TIMESTAMP(3) NOT NULL,
          consumed_at     TIMESTAMP(3) NULL
        );
    `);

    await knex.raw(`
        CREATE TABLE oauth_token_families (
          family_id    CHAR(26) NOT NULL PRIMARY KEY,
          client_id    BYTEA NOT NULL,
          account_id   BIGINT NOT NULL,
          resource     VARCHAR(255) NULL,
          scope        VARCHAR(512) NOT NULL,
          created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          absolute_expires_at TIMESTAMP NOT NULL,
          revoked_at   TIMESTAMP(3) NULL,
          revoked_reason VARCHAR(255) NULL
        );
    `);

    await knex.raw(`
        CREATE TABLE oauth_refresh_tokens (
          token_hash   BYTEA NOT NULL PRIMARY KEY,
          family_id    CHAR(26) NOT NULL,
          expires_at   TIMESTAMP(3) NOT NULL,
          rotated_at   TIMESTAMP(3) NULL,
          created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX ix_family ON oauth_refresh_tokens (family_id);
    `);

    await knex.raw(`
        CREATE TABLE revoked_jti (
          jti BYTEA NOT NULL PRIMARY KEY,
          expires_at TIMESTAMP NOT NULL
        );
    `);

    // NOTE: private_jwk stored as plain JSON, not AES-GCM-encrypted at rest,
    // per the "move fast" directive. Follow-up: wrap with a KEK before any
    // real deployment (see the full design's §5.5).
    await knex.raw(`
        CREATE TABLE signing_keys (
          kid         VARCHAR(64) NOT NULL PRIMARY KEY,
          alg         VARCHAR(16) NOT NULL DEFAULT 'ES256',
          state       VARCHAR(16) NOT NULL DEFAULT 'current' CHECK (state IN ('current','retiring')),
          public_jwk  JSONB NOT NULL,
          private_jwk JSONB NOT NULL,
          created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);

    await knex.raw(`
        CREATE TABLE api_keys (
          id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          key_id         BYTEA NOT NULL,
          secret_hmac    BYTEA NOT NULL,
          owner_account_id BIGINT NOT NULL,
          name           VARCHAR(128) NOT NULL,
          scope          VARCHAR(512) NOT NULL DEFAULT 'catalog:read',
          expires_at     TIMESTAMP NOT NULL,
          last_used_at   TIMESTAMP NULL,
          revoked_at     TIMESTAMP NULL,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_apikeys_keyid UNIQUE (key_id),
          CONSTRAINT uq_apikeys_hmac UNIQUE (secret_hmac),
          CONSTRAINT fk_apikeys_account FOREIGN KEY (owner_account_id) REFERENCES accounts (id) ON DELETE RESTRICT
        );
    `);

    await knex.raw(`
        CREATE TABLE oauth_consents (
          account_id BIGINT NOT NULL,
          client_id  BYTEA NOT NULL,
          scope      VARCHAR(512) NOT NULL,
          granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (account_id, client_id)
        );
    `);
};

exports.down = async function down(knex) {
    await knex.raw('DROP TABLE IF EXISTS oauth_consents');
    await knex.raw('DROP TABLE IF EXISTS api_keys');
    await knex.raw('DROP TABLE IF EXISTS signing_keys');
    await knex.raw('DROP TABLE IF EXISTS revoked_jti');
    await knex.raw('DROP TABLE IF EXISTS oauth_refresh_tokens');
    await knex.raw('DROP TABLE IF EXISTS oauth_token_families');
    await knex.raw('DROP TABLE IF EXISTS oauth_authorization_codes');
    await knex.raw('DROP TABLE IF EXISTS oauth_clients');
};
