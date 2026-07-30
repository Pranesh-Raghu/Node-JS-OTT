// Phase 3 schema. Additive-only: does not touch the legacy `users`/`admins`
// tables, which are migrated by scripts/backfill-accounts.js and retired in
// a later migration once parity is verified.
exports.up = async function up(knex) {
    await knex.raw(`
        CREATE TABLE accounts (
          id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid                CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          username            VARCHAR(64)  NOT NULL,
          email               VARCHAR(320) NULL,
          password_hash       VARCHAR(255) NULL,
          password_algo       ENUM('bcrypt','argon2id') NULL,
          role                ENUM('user','admin') NOT NULL DEFAULT 'user',
          status              ENUM('active','pending_reset','suspended','deleted') NOT NULL DEFAULT 'active',
          must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
          failed_login_count  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          locked_until        DATETIME NULL,
          last_login_at       DATETIME NULL,
          created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_accounts_ulid (ulid),
          UNIQUE KEY uq_accounts_username (username),
          UNIQUE KEY uq_accounts_email (email),
          KEY ix_accounts_role (role, status),
          CONSTRAINT ck_accounts_hash_pair CHECK ((password_hash IS NULL) = (password_algo IS NULL))
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE profiles (
          id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid             CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          account_id       BIGINT UNSIGNED NOT NULL,
          name             VARCHAR(64) NOT NULL,
          is_default       TINYINT(1) NOT NULL DEFAULT 0,
          is_kids          TINYINT(1) NOT NULL DEFAULT 0,
          maturity_ceiling ENUM('U','UA7','UA13','UA16','A') NOT NULL DEFAULT 'A',
          avatar_url       VARCHAR(2048) NULL,
          default_marker   BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_default = 1, account_id, NULL)) STORED,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at       DATETIME NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_profiles_ulid (ulid),
          UNIQUE KEY uq_profiles_acct_name (account_id, name),
          UNIQUE KEY uq_profiles_one_default (default_marker),
          KEY ix_profiles_account (account_id, deleted_at),
          -- RESTRICT, not CASCADE: MySQL disallows CASCADE/SET NULL on a column
          -- that's a base column of a STORED generated column (default_marker
          -- depends on account_id). Account deletion cascades to profiles at
          -- the application/service layer instead.
          CONSTRAINT fk_profiles_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE plans (
          id             SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
          code           VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          name           VARCHAR(64) NOT NULL,
          price_minor    INT UNSIGNED NOT NULL,
          currency       CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'USD',
          billing_period ENUM('month','year') NOT NULL,
          max_streams    TINYINT UNSIGNED NOT NULL DEFAULT 1,
          max_profiles   TINYINT UNSIGNED NOT NULL DEFAULT 1,
          max_quality    ENUM('480p','720p','1080p','2160p') NOT NULL DEFAULT '720p',
          allow_download TINYINT(1) NOT NULL DEFAULT 0,
          sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          is_active      TINYINT(1) NOT NULL DEFAULT 1,
          created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_plans_code (code)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE subscriptions (
          id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid                 CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          account_id           BIGINT UNSIGNED NOT NULL,
          plan_id              SMALLINT UNSIGNED NOT NULL,
          status               ENUM('trialing','active','past_due','canceled','expired') NOT NULL,
          current_period_start DATETIME NOT NULL,
          current_period_end   DATETIME NOT NULL,
          cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0,
          canceled_at          DATETIME NULL,
          external_ref         VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
          active_marker        BIGINT UNSIGNED GENERATED ALWAYS AS (
                                 IF(status IN ('trialing','active','past_due'), account_id, NULL)
                               ) STORED,
          created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_subs_ulid (ulid),
          UNIQUE KEY uq_subs_external (external_ref),
          UNIQUE KEY uq_subs_one_active (active_marker),
          KEY ix_subs_account (account_id, status, current_period_end),
          -- RESTRICT: active_marker is a STORED generated column depending on
          -- account_id, and MySQL forbids CASCADE on such a column's FK.
          CONSTRAINT fk_subs_account FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE RESTRICT,
          CONSTRAINT fk_subs_plan FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT,
          CONSTRAINT ck_subs_period CHECK (current_period_end > current_period_start)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE titles (
          id                     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid                   CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          slug                   VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          legacy_id              VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
          kind                   ENUM('movie','series','season','episode') NOT NULL DEFAULT 'movie',
          parent_title_id        BIGINT UNSIGNED NULL,
          title                  VARCHAR(255) NOT NULL,
          original_title         VARCHAR(255) NULL,
          synopsis               TEXT NULL,
          release_date           DATE NULL,
          release_date_precision ENUM('day','month','year','unknown') NOT NULL DEFAULT 'day',
          runtime_minutes        SMALLINT UNSIGNED NULL,
          maturity_rating        ENUM('U','UA7','UA13','UA16','A') NULL,
          poster_url             VARCHAR(2048) NOT NULL,
          backdrop_url           VARCHAR(2048) NULL,
          status                 ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
          published_at           DATETIME NULL,
          created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          deleted_at             DATETIME NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_titles_ulid (ulid),
          UNIQUE KEY uq_titles_slug (slug),
          UNIQUE KEY uq_titles_legacy (legacy_id),
          KEY ix_titles_browse (status, deleted_at, release_date DESC, id DESC),
          KEY ix_titles_parent (parent_title_id, kind),
          FULLTEXT KEY ft_titles (title, original_title, synopsis),
          CONSTRAINT fk_titles_parent FOREIGN KEY (parent_title_id) REFERENCES titles (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE genres (
          id   SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
          slug VARCHAR(48) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          name VARCHAR(64) NOT NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uq_genres_slug (slug),
          UNIQUE KEY uq_genres_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE title_genres (
          title_id BIGINT UNSIGNED NOT NULL,
          genre_id SMALLINT UNSIGNED NOT NULL,
          PRIMARY KEY (title_id, genre_id),
          KEY ix_tg_reverse (genre_id, title_id),
          CONSTRAINT fk_tg_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
          CONSTRAINT fk_tg_genre FOREIGN KEY (genre_id) REFERENCES genres (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE people (
          id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid       CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          slug       VARCHAR(180) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          name       VARCHAR(160) NOT NULL,
          photo_url  VARCHAR(2048) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_people_ulid (ulid),
          UNIQUE KEY uq_people_slug (slug),
          KEY ix_people_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE title_credits (
          id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          title_id      BIGINT UNSIGNED NOT NULL,
          person_id     BIGINT UNSIGNED NOT NULL,
          credit_type   ENUM('cast','crew') NOT NULL,
          role          VARCHAR(160) NOT NULL,
          department    VARCHAR(64) NULL,
          billing_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          UNIQUE KEY uq_credit (title_id, person_id, credit_type, role),
          KEY ix_credits_title (title_id, credit_type, billing_order),
          KEY ix_credits_person (person_id, credit_type),
          CONSTRAINT fk_credits_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE,
          CONSTRAINT fk_credits_person FOREIGN KEY (person_id) REFERENCES people (id) ON DELETE RESTRICT
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE video_assets (
          id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          ulid             CHAR(26) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          title_id         BIGINT UNSIGNED NOT NULL,
          legacy_id        VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL,
          label            VARCHAR(160) NOT NULL,
          asset_type       ENUM('feature','trailer','clip','extra') NOT NULL DEFAULT 'feature',
          source_url       VARCHAR(2048) NOT NULL,
          container        ENUM('mp4','hls','dash') NOT NULL DEFAULT 'mp4',
          duration_seconds INT UNSIGNED NULL,
          width            SMALLINT UNSIGNED NULL,
          height           SMALLINT UNSIGNED NULL,
          min_plan_id      SMALLINT UNSIGNED NULL,
          status           ENUM('draft','ready','broken','archived') NOT NULL DEFAULT 'draft',
          feature_marker   BIGINT UNSIGNED GENERATED ALWAYS AS (IF(asset_type = 'feature', title_id, NULL)) STORED,
          created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_va_ulid (ulid),
          UNIQUE KEY uq_va_legacy (legacy_id),
          UNIQUE KEY uq_va_feature (feature_marker),
          KEY ix_va_title (title_id, asset_type, status),
          -- RESTRICT: feature_marker is a STORED generated column depending on
          -- title_id, and MySQL forbids CASCADE on such a column's FK.
          CONSTRAINT fk_va_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE RESTRICT,
          CONSTRAINT fk_va_plan FOREIGN KEY (min_plan_id) REFERENCES plans (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE watchlist_items (
          profile_id BIGINT UNSIGNED NOT NULL,
          title_id   BIGINT UNSIGNED NOT NULL,
          added_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, title_id),
          KEY ix_wl_recent (profile_id, added_at DESC),
          KEY ix_wl_title (title_id),
          CONSTRAINT fk_wl_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
          CONSTRAINT fk_wl_title FOREIGN KEY (title_id) REFERENCES titles (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE playback_progress (
          profile_id       BIGINT UNSIGNED NOT NULL,
          video_asset_id   BIGINT UNSIGNED NOT NULL,
          position_seconds DECIMAL(10,3) UNSIGNED NOT NULL DEFAULT 0,
          duration_seconds DECIMAL(10,3) UNSIGNED NULL,
          percent_complete DECIMAL(5,2) UNSIGNED GENERATED ALWAYS AS (
                             IF(duration_seconds > 0, LEAST(100, ROUND(position_seconds / duration_seconds * 100, 2)), NULL)
                           ) STORED,
          completed        TINYINT(1) NOT NULL DEFAULT 0,
          play_count       INT UNSIGNED NOT NULL DEFAULT 0,
          first_played_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_played_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (profile_id, video_asset_id),
          KEY ix_pp_continue (profile_id, completed, last_played_at DESC),
          CONSTRAINT fk_pp_profile FOREIGN KEY (profile_id) REFERENCES profiles (id) ON DELETE CASCADE,
          CONSTRAINT fk_pp_asset FOREIGN KEY (video_asset_id) REFERENCES video_assets (id) ON DELETE CASCADE,
          CONSTRAINT ck_pp_bounds CHECK (duration_seconds IS NULL OR position_seconds <= duration_seconds)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    // Replaces the express-mysql-session auto-created table (which has no
    // index on `expires`, so its expiry sweep full-scans).
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS sessions (
          session_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          expires    INT UNSIGNED NOT NULL,
          data       MEDIUMTEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
          PRIMARY KEY (session_id),
          KEY ix_sessions_expires (expires)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
    `);

    await knex.raw(`
        CREATE TABLE audit_log (
          id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          actor_account_id BIGINT UNSIGNED NULL,
          actor_kind       ENUM('user','admin','system','api_key') NOT NULL,
          action           VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          entity_type      VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          entity_id        VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
          before_json      JSON NULL,
          after_json       JSON NULL,
          request_id       CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
          ip               VARBINARY(16) NULL,
          user_agent       VARCHAR(512) NULL,
          created_at       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (id),
          KEY ix_audit_entity (entity_type, entity_id, created_at),
          KEY ix_audit_actor (actor_account_id, created_at),
          CONSTRAINT fk_audit_actor FOREIGN KEY (actor_account_id) REFERENCES accounts (id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
};
