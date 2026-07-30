// Simplified OAuth 2.1 AS schema. Per an explicit "move fast" directive this
// skips some hardening called out in the design doc (private keys stored as
// plain JWK rather than AES-GCM-encrypted, no provisional-client throttling
// table) — those are flagged in code comments as follow-ups, not silently
// dropped.
exports.up = async function up(knex) {
    await knex.raw(`
        CREATE TABLE oauth_clients (
          client_id      VARBINARY(512) NOT NULL,
          client_name    VARCHAR(128) NOT NULL,
          kind           ENUM('dcr','cimd','static') NOT NULL DEFAULT 'dcr',
          redirect_uris  JSON NOT NULL,
          token_endpoint_auth_method ENUM('none','private_key_jwt') NOT NULL DEFAULT 'none',
          grant_types    JSON NOT NULL,
          scope          VARCHAR(512) NOT NULL DEFAULT 'catalog:read',
          registration_access_token_hash BINARY(32) NULL,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at   DATETIME NULL,
          PRIMARY KEY (client_id(255))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE oauth_authorization_codes (
          code_hash       BINARY(32) NOT NULL,
          client_id       VARBINARY(512) NOT NULL,
          account_id      BIGINT UNSIGNED NOT NULL,
          redirect_uri    VARBINARY(512) NOT NULL,
          code_challenge  VARBINARY(128) NOT NULL,
          scope           VARCHAR(512) NOT NULL,
          resource        VARCHAR(255) NULL,
          expires_at      DATETIME(3) NOT NULL,
          consumed_at     DATETIME(3) NULL,
          PRIMARY KEY (code_hash)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE oauth_token_families (
          family_id    CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          client_id    VARBINARY(512) NOT NULL,
          account_id   BIGINT UNSIGNED NOT NULL,
          resource     VARCHAR(255) NULL,
          scope        VARCHAR(512) NOT NULL,
          created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          absolute_expires_at DATETIME NOT NULL,
          revoked_at   DATETIME(3) NULL,
          revoked_reason VARCHAR(255) NULL,
          PRIMARY KEY (family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE oauth_refresh_tokens (
          token_hash   BINARY(32) NOT NULL,
          family_id    CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          expires_at   DATETIME(3) NOT NULL,
          rotated_at   DATETIME(3) NULL,
          created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (token_hash),
          KEY ix_family (family_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE revoked_jti (
          jti VARBINARY(64) NOT NULL,
          expires_at DATETIME NOT NULL,
          PRIMARY KEY (jti)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // NOTE: private_jwk stored as plain JSON, not AES-GCM-encrypted at rest,
    // per the "move fast" directive. Follow-up: wrap with a KEK before any
    // real deployment (see the full design's §5.5).
    await knex.raw(`
        CREATE TABLE signing_keys (
          kid         VARCHAR(64) NOT NULL,
          alg         VARCHAR(16) NOT NULL DEFAULT 'ES256',
          state       ENUM('current','retiring') NOT NULL DEFAULT 'current',
          public_jwk  JSON NOT NULL,
          private_jwk JSON NOT NULL,
          created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (kid)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE api_keys (
          id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          key_id         VARBINARY(32) NOT NULL,
          secret_hmac    BINARY(32) NOT NULL,
          owner_account_id BIGINT UNSIGNED NOT NULL,
          name           VARCHAR(128) NOT NULL,
          scope          VARCHAR(512) NOT NULL DEFAULT 'catalog:read',
          expires_at     DATETIME NOT NULL,
          last_used_at   DATETIME NULL,
          revoked_at     DATETIME NULL,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_apikeys_keyid (key_id),
          UNIQUE KEY uq_apikeys_hmac (secret_hmac),
          CONSTRAINT fk_apikeys_account FOREIGN KEY (owner_account_id) REFERENCES accounts (id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE oauth_consents (
          account_id BIGINT UNSIGNED NOT NULL,
          client_id  VARBINARY(512) NOT NULL,
          scope      VARCHAR(512) NOT NULL,
          granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (account_id, client_id(255))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
