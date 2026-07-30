// Session/device management + outbound webhooks. Additive-only, no changes
// to the `sessions` table (owned by connect-pg-simple, created in
// migration 0001) or anything in the OpenFGA/OIDC track's territory.
//
// Per the "move fast" directive: session_devices has no FK to `sessions`
// (there's no guarantee against the session store's own row-creation timing,
// so a FK could deadlock/fail on legitimate writes) - it's just indexed on
// session_id and cleaned up explicitly wherever a session is revoked.
exports.up = async function up(knex) {
    // A dedicated function rather than reusing migration 0001's
    // set_updated_at() - this table's auto-touched column is named
    // last_seen_at, not updated_at.
    await knex.raw(`
        CREATE OR REPLACE FUNCTION set_last_seen_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.last_seen_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    await knex.raw(`
        CREATE TABLE session_devices (
          session_id     VARCHAR(128) NOT NULL PRIMARY KEY,
          account_id     BIGINT NOT NULL,
          user_agent     VARCHAR(512) NULL,
          -- Native INET (not BYTEA) - ip_address is write-only in this app
          -- (never read back), and Postgres can parse/store the IP string
          -- directly with no conversion function needed, unlike MySQL's
          -- INET6_ATON()/VARBINARY(16) pairing.
          ip_address     INET NULL,
          label          VARCHAR(128) NULL,
          first_seen_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_seen_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_session_devices_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_session_devices_account ON session_devices (account_id);
        CREATE TRIGGER trg_session_devices_last_seen BEFORE UPDATE ON session_devices
          FOR EACH ROW EXECUTE FUNCTION set_last_seen_at();
    `);

    await knex.raw(`
        CREATE TABLE webhook_endpoints (
          id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          account_id           BIGINT NOT NULL,
          url                  VARCHAR(2048) NOT NULL,
          secret               BYTEA NOT NULL,
          event_types          JSONB NOT NULL,
          status               VARCHAR(16) NOT NULL DEFAULT 'enabled' CHECK (status IN ('enabled','disabled')),
          created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          consecutive_failures SMALLINT NOT NULL DEFAULT 0,
          CONSTRAINT fk_webhook_endpoints_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_webhook_endpoints_account ON webhook_endpoints (account_id);
    `);

    // event_id is a ULID (26 ascii chars); (status, next_attempt_at) is the
    // index the delivery worker's polling query needs.
    await knex.raw(`
        CREATE TABLE webhook_deliveries (
          id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          endpoint_id      BIGINT NOT NULL,
          event_id         CHAR(26) NOT NULL,
          event_type       VARCHAR(64) NOT NULL,
          payload          JSONB NOT NULL,
          status           VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed','abandoned')),
          attempts         SMALLINT NOT NULL DEFAULT 0,
          next_attempt_at  TIMESTAMP NOT NULL,
          last_error       VARCHAR(512) NULL,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_webhook_deliveries_endpoint FOREIGN KEY (endpoint_id) REFERENCES webhook_endpoints (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_webhook_deliveries_poll ON webhook_deliveries (status, next_attempt_at);
        CREATE INDEX ix_webhook_deliveries_endpoint ON webhook_deliveries (endpoint_id);
    `);
};

exports.down = async function down(knex) {
    await knex.raw('DROP TABLE IF EXISTS webhook_deliveries;');
    await knex.raw('DROP TABLE IF EXISTS webhook_endpoints;');
    await knex.raw('DROP TABLE IF EXISTS session_devices;');
    await knex.raw('DROP FUNCTION IF EXISTS set_last_seen_at;');
};
