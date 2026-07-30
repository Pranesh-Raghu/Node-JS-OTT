// Session/device management + outbound webhooks. Additive-only, no changes
// to the `sessions` table (owned by express-mysql-session) or anything in
// the OpenFGA/OIDC track's territory.
//
// Per the "move fast" directive: session_devices has no FK to `sessions`
// (express-mysql-session doesn't guarantee row-creation timing against it,
// so a FK could deadlock/fail on legitimate writes) — it's just indexed on
// session_id and cleaned up explicitly wherever a session is revoked.
exports.up = async function up(knex) {
    await knex.raw(`
        CREATE TABLE session_devices (
          session_id     VARCHAR(128) NOT NULL,
          account_id     BIGINT UNSIGNED NOT NULL,
          user_agent     VARCHAR(512) NULL,
          ip_address     VARBINARY(16) NULL,
          label          VARCHAR(128) NULL,
          first_seen_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (session_id),
          KEY ix_session_devices_account (account_id),
          CONSTRAINT fk_session_devices_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE webhook_endpoints (
          id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          account_id           BIGINT UNSIGNED NOT NULL,
          url                  VARCHAR(2048) NOT NULL,
          secret               BINARY(32) NOT NULL,
          event_types          JSON NOT NULL,
          status               ENUM('enabled','disabled') NOT NULL DEFAULT 'enabled',
          created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          consecutive_failures SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          KEY ix_webhook_endpoints_account (account_id),
          CONSTRAINT fk_webhook_endpoints_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // event_id is a ULID (26 ascii chars); (status, next_attempt_at) is the
    // index the delivery worker's polling query needs.
    await knex.raw(`
        CREATE TABLE webhook_deliveries (
          id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          endpoint_id      BIGINT UNSIGNED NOT NULL,
          event_id         CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          event_type       VARCHAR(64) NOT NULL,
          payload          JSON NOT NULL,
          status           ENUM('pending','delivered','failed','abandoned') NOT NULL DEFAULT 'pending',
          attempts         SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          next_attempt_at  DATETIME NOT NULL,
          last_error       VARCHAR(512) NULL,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY ix_webhook_deliveries_poll (status, next_attempt_at),
          KEY ix_webhook_deliveries_endpoint (endpoint_id),
          CONSTRAINT fk_webhook_deliveries_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);
};

exports.down = async function down(knex) {
    await knex.raw('DROP TABLE IF EXISTS webhook_deliveries;');
    await knex.raw('DROP TABLE IF EXISTS webhook_endpoints;');
    await knex.raw('DROP TABLE IF EXISTS session_devices;');
};
