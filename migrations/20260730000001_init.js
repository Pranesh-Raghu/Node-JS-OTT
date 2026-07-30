// Phase 3 schema, ported from MySQL to Postgres. Additive-only: does not
// touch the legacy `users`/`admins` tables, which are migrated by
// scripts/backfill-accounts.js and retired in a later migration once parity
// is verified.
//
// Porting notes (MySQL -> Postgres):
// - AUTO_INCREMENT -> GENERATED ALWAYS AS IDENTITY; UNSIGNED dropped (no
//   Postgres equivalent, not enforced elsewhere in the app).
// - ENUM(...) -> VARCHAR + CHECK (col IN (...)) - avoids the ALTER TYPE
//   dance Postgres native enums need whenever a value is added later.
// - TINYINT(1) booleans -> real BOOLEAN.
// - `... ON UPDATE CURRENT_TIMESTAMP` has no Postgres equivalent - a shared
//   trigger function (set_updated_at, created once below) does the same
//   job on every table with an updated_at column.
// - FULLTEXT KEY on titles dropped: the app's actual search
//   (titleRepo.searchPublished) only ever used a plain LIKE query, never
//   MySQL's MATCH/AGAINST, so there's no behavior to preserve here.
// - VARBINARY -> BYTEA, JSON -> JSONB, MEDIUMTEXT -> TEXT.
// - MySQL's inline `KEY name (...)` (non-unique index) becomes a separate
//   CREATE INDEX statement after each table, since Postgres has no inline
//   index syntax.
exports.up = async function up(knex) {
    // `users`/`admins` predate the knex migration system entirely - under
    // MySQL they were the original hand-written app's tables, never
    // created by a migration, and every later migration in this file
    // assumed they already existed. Ported here from the live MySQL
    // schema (discovered via SHOW CREATE TABLE) since a fresh Postgres
    // database has nothing to inherit them from.
    await knex.raw(`
        CREATE TABLE users (
          id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          username     VARCHAR(255) NOT NULL,
          password     VARCHAR(255) NULL,
          email        VARCHAR(320) NULL,
          google_sub   VARCHAR(255) NULL,
          avatar_url   VARCHAR(512) NULL,
          avatar_image BYTEA NULL,
          avatar_mime  VARCHAR(50) NULL,
          CONSTRAINT uq_users_username UNIQUE (username),
          CONSTRAINT uq_users_email UNIQUE (email),
          CONSTRAINT uq_users_google_sub UNIQUE (google_sub)
        );
    `);

    await knex.raw(`
        CREATE TABLE admins (
          id       INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          username VARCHAR(255) NOT NULL,
          password VARCHAR(255) NOT NULL,
          CONSTRAINT uq_admins_username UNIQUE (username)
        );
    `);

    await knex.raw(`
        CREATE OR REPLACE FUNCTION set_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    `);

    await knex.raw(`
        CREATE TABLE accounts (
          id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid                CHAR(26) NOT NULL,
          username            VARCHAR(64)  NOT NULL,
          email               VARCHAR(320) NULL,
          password_hash       VARCHAR(255) NULL,
          password_algo       VARCHAR(16) NULL CHECK (password_algo IN ('bcrypt','argon2id')),
          role                VARCHAR(16) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
          status              VARCHAR(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_reset','suspended','deleted')),
          must_reset_password BOOLEAN NOT NULL DEFAULT FALSE,
          failed_login_count  SMALLINT NOT NULL DEFAULT 0,
          locked_until        TIMESTAMP NULL,
          last_login_at       TIMESTAMP NULL,
          created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_accounts_ulid UNIQUE (ulid),
          CONSTRAINT uq_accounts_username UNIQUE (username),
          CONSTRAINT uq_accounts_email UNIQUE (email),
          CONSTRAINT ck_accounts_hash_pair CHECK ((password_hash IS NULL) = (password_algo IS NULL))
        );
        CREATE INDEX ix_accounts_role ON accounts (role, status);
        CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON accounts
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE profiles (
          id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid             CHAR(26) NOT NULL,
          account_id       BIGINT NOT NULL,
          name             VARCHAR(64) NOT NULL,
          is_default       BOOLEAN NOT NULL DEFAULT FALSE,
          is_kids          BOOLEAN NOT NULL DEFAULT FALSE,
          maturity_ceiling VARCHAR(8) NOT NULL DEFAULT 'A' CHECK (maturity_ceiling IN ('U','UA7','UA13','UA16','A')),
          avatar_url       VARCHAR(2048) NULL,
          default_marker   BIGINT GENERATED ALWAYS AS (CASE WHEN is_default THEN account_id ELSE NULL END) STORED,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at       TIMESTAMP NULL,
          CONSTRAINT uq_profiles_ulid UNIQUE (ulid),
          CONSTRAINT uq_profiles_acct_name UNIQUE (account_id, name),
          CONSTRAINT uq_profiles_one_default UNIQUE (default_marker),
          CONSTRAINT fk_profiles_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT
        );
        CREATE INDEX ix_profiles_account ON profiles (account_id, deleted_at);
        CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON profiles
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE plans (
          id             SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          code           VARCHAR(32) NOT NULL,
          name           VARCHAR(64) NOT NULL,
          price_minor    INT NOT NULL,
          currency       CHAR(3) NOT NULL DEFAULT 'USD',
          billing_period VARCHAR(8) NOT NULL CHECK (billing_period IN ('month','year')),
          max_streams    SMALLINT NOT NULL DEFAULT 1,
          max_profiles   SMALLINT NOT NULL DEFAULT 1,
          max_quality    VARCHAR(8) NOT NULL DEFAULT '720p' CHECK (max_quality IN ('480p','720p','1080p','2160p')),
          allow_download BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order     SMALLINT NOT NULL DEFAULT 0,
          is_active      BOOLEAN NOT NULL DEFAULT TRUE,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_plans_code UNIQUE (code)
        );
        CREATE TRIGGER trg_plans_updated_at BEFORE UPDATE ON plans
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE subscriptions (
          id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid                 CHAR(26) NOT NULL,
          account_id           BIGINT NOT NULL,
          plan_id              SMALLINT NOT NULL,
          status               VARCHAR(16) NOT NULL CHECK (status IN ('trialing','active','past_due','canceled','expired')),
          current_period_start TIMESTAMP NOT NULL,
          current_period_end   TIMESTAMP NOT NULL,
          cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
          canceled_at          TIMESTAMP NULL,
          external_ref         VARCHAR(128) NULL,
          active_marker        BIGINT GENERATED ALWAYS AS (
                                 CASE WHEN status IN ('trialing','active','past_due') THEN account_id ELSE NULL END
                               ) STORED,
          created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_subs_ulid UNIQUE (ulid),
          CONSTRAINT uq_subs_external UNIQUE (external_ref),
          CONSTRAINT uq_subs_one_active UNIQUE (active_marker),
          CONSTRAINT fk_subs_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
          CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT,
          CONSTRAINT ck_subs_period CHECK (current_period_end > current_period_start)
        );
        CREATE INDEX ix_subs_account ON subscriptions (account_id, status, current_period_end);
        CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE titles (
          id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid                   CHAR(26) NOT NULL,
          slug                   VARCHAR(180) NOT NULL,
          legacy_id              VARCHAR(16) NULL,
          kind                   VARCHAR(16) NOT NULL DEFAULT 'movie' CHECK (kind IN ('movie','series','season','episode')),
          parent_title_id        BIGINT NULL,
          title                  VARCHAR(255) NOT NULL,
          original_title         VARCHAR(255) NULL,
          synopsis               TEXT NULL,
          release_date           DATE NULL,
          release_date_precision VARCHAR(16) NOT NULL DEFAULT 'day' CHECK (release_date_precision IN ('day','month','year','unknown')),
          runtime_minutes        SMALLINT NULL,
          maturity_rating        VARCHAR(8) NULL CHECK (maturity_rating IN ('U','UA7','UA13','UA16','A')),
          poster_url             VARCHAR(2048) NOT NULL,
          backdrop_url           VARCHAR(2048) NULL,
          status                 VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
          published_at           TIMESTAMP NULL,
          created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          deleted_at             TIMESTAMP NULL,
          CONSTRAINT uq_titles_ulid UNIQUE (ulid),
          CONSTRAINT uq_titles_slug UNIQUE (slug),
          CONSTRAINT uq_titles_legacy UNIQUE (legacy_id),
          CONSTRAINT fk_titles_parent FOREIGN KEY (parent_title_id) REFERENCES titles (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_titles_browse ON titles (status, deleted_at, release_date DESC, id DESC);
        CREATE INDEX ix_titles_parent ON titles (parent_title_id, kind);
        CREATE TRIGGER trg_titles_updated_at BEFORE UPDATE ON titles
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE genres (
          id   SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          slug VARCHAR(48) NOT NULL,
          name VARCHAR(64) NOT NULL,
          CONSTRAINT uq_genres_slug UNIQUE (slug),
          CONSTRAINT uq_genres_name UNIQUE (name)
        );
    `);

    await knex.raw(`
        CREATE TABLE title_genres (
          title_id BIGINT NOT NULL,
          genre_id SMALLINT NOT NULL,
          PRIMARY KEY (title_id, genre_id),
          CONSTRAINT fk_tg_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
          CONSTRAINT fk_tg_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_tg_reverse ON title_genres (genre_id, title_id);
    `);

    await knex.raw(`
        CREATE TABLE people (
          id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid       CHAR(26) NOT NULL,
          slug       VARCHAR(180) NOT NULL,
          name       VARCHAR(160) NOT NULL,
          photo_url  VARCHAR(2048) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_people_ulid UNIQUE (ulid),
          CONSTRAINT uq_people_slug UNIQUE (slug)
        );
        CREATE INDEX ix_people_name ON people (name);
        CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON people
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE title_credits (
          id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          title_id      BIGINT NOT NULL,
          person_id     BIGINT NOT NULL,
          credit_type   VARCHAR(8) NOT NULL CHECK (credit_type IN ('cast','crew')),
          role          VARCHAR(160) NOT NULL,
          department    VARCHAR(64) NULL,
          billing_order SMALLINT NOT NULL DEFAULT 0,
          CONSTRAINT uq_credit UNIQUE (title_id, person_id, credit_type, role),
          CONSTRAINT fk_credits_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
          CONSTRAINT fk_credits_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE RESTRICT
        );
        CREATE INDEX ix_credits_title ON title_credits (title_id, credit_type, billing_order);
        CREATE INDEX ix_credits_person ON title_credits (person_id, credit_type);
    `);

    await knex.raw(`
        CREATE TABLE video_assets (
          id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ulid             CHAR(26) NOT NULL,
          title_id         BIGINT NOT NULL,
          legacy_id        VARCHAR(16) NULL,
          label            VARCHAR(160) NOT NULL,
          asset_type       VARCHAR(16) NOT NULL DEFAULT 'feature' CHECK (asset_type IN ('feature','trailer','clip','extra')),
          source_url       VARCHAR(2048) NOT NULL,
          container        VARCHAR(8) NOT NULL DEFAULT 'mp4' CHECK (container IN ('mp4','hls','dash')),
          duration_seconds INT NULL,
          width            SMALLINT NULL,
          height           SMALLINT NULL,
          min_plan_id      SMALLINT NULL,
          status           VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','broken','archived')),
          feature_marker   BIGINT GENERATED ALWAYS AS (CASE WHEN asset_type = 'feature' THEN title_id ELSE NULL END) STORED,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT uq_va_ulid UNIQUE (ulid),
          CONSTRAINT uq_va_legacy UNIQUE (legacy_id),
          CONSTRAINT uq_va_feature UNIQUE (feature_marker),
          CONSTRAINT fk_va_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE RESTRICT,
          CONSTRAINT fk_va_plan FOREIGN KEY (min_plan_id) REFERENCES plans (id) ON DELETE SET NULL
        );
        CREATE INDEX ix_va_title ON video_assets (title_id, asset_type, status);
        CREATE TRIGGER trg_video_assets_updated_at BEFORE UPDATE ON video_assets
          FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);

    await knex.raw(`
        CREATE TABLE watchlist_items (
          profile_id BIGINT NOT NULL,
          title_id   BIGINT NOT NULL,
          added_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, title_id),
          CONSTRAINT fk_wl_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
          CONSTRAINT fk_wl_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
        );
        CREATE INDEX ix_wl_recent ON watchlist_items (profile_id, added_at DESC);
        CREATE INDEX ix_wl_title ON watchlist_items (title_id);
    `);

    await knex.raw(`
        CREATE TABLE playback_progress (
          profile_id       BIGINT NOT NULL,
          video_asset_id   BIGINT NOT NULL,
          position_seconds NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (position_seconds >= 0),
          duration_seconds NUMERIC(10,3) NULL CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
          percent_complete NUMERIC(5,2) GENERATED ALWAYS AS (
                             CASE WHEN duration_seconds > 0
                               THEN LEAST(100, ROUND(position_seconds / duration_seconds * 100, 2))
                               ELSE NULL END
                           ) STORED,
          completed        BOOLEAN NOT NULL DEFAULT FALSE,
          play_count       INT NOT NULL DEFAULT 0,
          first_played_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_played_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, video_asset_id),
          CONSTRAINT fk_pp_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
          CONSTRAINT fk_pp_asset FOREIGN KEY (video_asset_id) REFERENCES video_assets (id) ON DELETE CASCADE,
          CONSTRAINT ck_pp_bounds CHECK (duration_seconds IS NULL OR position_seconds <= duration_seconds)
        );
        CREATE INDEX ix_pp_continue ON playback_progress (profile_id, completed, last_played_at DESC);
    `);

    // Replaces the connect-pg-simple auto-created table with one that has
    // an index on `expire` from the start.
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid    VARCHAR(255) NOT NULL PRIMARY KEY,
          sess   JSON NOT NULL,
          expire TIMESTAMP NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ix_sessions_expire ON sessions (expire);
    `);

    await knex.raw(`
        CREATE TABLE audit_log (
          id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          actor_account_id BIGINT NULL,
          actor_kind       VARCHAR(16) NOT NULL CHECK (actor_kind IN ('user','admin','system','api_key')),
          action           VARCHAR(64) NOT NULL,
          entity_type      VARCHAR(64) NOT NULL,
          entity_id        VARCHAR(64) NULL,
          before_json      JSONB NULL,
          after_json       JSONB NULL,
          request_id       CHAR(36) NULL,
          ip               BYTEA NULL,
          user_agent       VARCHAR(512) NULL,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_audit_actor FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE SET NULL
        );
        CREATE INDEX ix_audit_entity ON audit_log (entity_type, entity_id, created_at);
        CREATE INDEX ix_audit_actor ON audit_log (actor_account_id, created_at);
    `);
};

exports.down = async function down(knex) {
    await knex.raw('DROP TABLE IF EXISTS audit_log');
    await knex.raw('DROP TABLE IF EXISTS sessions');
    await knex.raw('DROP TABLE IF EXISTS playback_progress');
    await knex.raw('DROP TABLE IF EXISTS watchlist_items');
    await knex.raw('DROP TABLE IF EXISTS video_assets');
    await knex.raw('DROP TABLE IF EXISTS title_credits');
    await knex.raw('DROP TABLE IF EXISTS people');
    await knex.raw('DROP TABLE IF EXISTS title_genres');
    await knex.raw('DROP TABLE IF EXISTS genres');
    await knex.raw('DROP TABLE IF EXISTS titles');
    await knex.raw('DROP TABLE IF EXISTS subscriptions');
    await knex.raw('DROP TABLE IF EXISTS plans');
    await knex.raw('DROP TABLE IF EXISTS profiles');
    await knex.raw('DROP TABLE IF EXISTS accounts');
    await knex.raw('DROP FUNCTION IF EXISTS set_updated_at');
    await knex.raw('DROP TABLE IF EXISTS admins');
    await knex.raw('DROP TABLE IF EXISTS users');
};
