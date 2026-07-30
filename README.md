# COMICS TV

A Marvel/DC streaming platform built on Express, EJS, and MySQL, with a hand-rolled
OAuth 2.1 authorization server, OpenFGA-based fine-grained authorization, an MCP server,
and Google SSO.

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Useful scripts](#useful-scripts)
- [Deployment](#deployment)

## Features

- **Catalog**: a real Marvel/DC movie catalog with TMDB-sourced posters and trailers,
  search, pagination, and a per-user watchlist.
- **Authentication**: email + password signup/login (username auto-generated from the
  email), Google SSO with account linking by verified email, and session/device
  management (list active sessions with city-level location, sign out individually or
  everywhere).
- **OAuth 2.1 authorization server**: hand-written (no third-party IdP or OAuth library)
  authorize/token/introspect/revoke/JWKS endpoints, PKCE (S256 only), refresh token
  rotation with reuse detection, and RFC 7591 Dynamic Client Registration.
- **MCP server**: a Model Context Protocol server mounted behind the OAuth 2.1 server,
  for AI agents to interact with the catalog under scoped, user-consented access.
- **Authorization**: OpenFGA (self-hosted) enforces fine-grained, per-object permissions
  (who can discover, play, or publish a title) on top of the OAuth scope layer.
- **Webhooks**: signed, retried outbound webhook deliveries for third-party integrators.
- **Theming**: a light/dark mode toggle, persisted server-side via a cookie (no flash of
  the wrong theme on load).

## Architecture

```
src/
  app.js               Express app factory (helmet, sessions, CSRF, rate limiting)
  index.js             Entry point, graceful shutdown, webhook delivery loop
  config/              Environment variable loading/validation
  db/                  MySQL connection pool + transaction helper
  repositories/        Only place raw SQL lives
  services/            Business logic, transaction boundaries
  controllers/         Request/response glue
  routes/              Express routers
  middleware/          CSRF, rate limiting, session/device tracking, view locals
  auth/                OAuth 2.1 authorization server, Google SSO client
  authz/               OpenFGA client + permission middleware
  mcp/                 Model Context Protocol server
  webhooks/            Signing, delivery, retry logic
authz/model.fga        OpenFGA authorization model (DSL)
migrations/            Knex migrations (raw SQL, no ORM at runtime)
scripts/               One-off seed/backfill scripts
views/                 EJS templates
public/                Static assets, CSS, client-side JS
```

## Requirements

- Node.js (version pinned in `.nvmrc` — `nvm use`)
- MySQL 8
- Docker (to run OpenFGA locally)
- A TMDB API key (for posters/trailers)
- A Google OAuth 2.0 client ID/secret (for Google SSO)

## Setup

1. Clone the repository and install dependencies.

   ```bash
   git clone <this-repo-url>
   cd Node-JS-OTT
   npm install
   ```

2. Copy the environment template and fill in real values.

   ```bash
   cp .env.example .env
   ```

   See [Environment variables](#environment-variables) below for what each one is for.

3. Create the MySQL database and run migrations.

   ```bash
   npx knex migrate:latest
   ```

4. Start OpenFGA locally with Docker, then create a store and write the authorization
   model from `authz/model.fga`. Put the resulting store ID and model ID into
   `FGA_STORE_ID` / `FGA_MODEL_ID` in `.env`.

5. Seed the catalog and OpenFGA tuples.

   ```bash
   node scripts/seed-catalog.js
   node scripts/seed-marvel-dc.js
   node scripts/seed-marvel-dc-batch2.js
   node scripts/seed-fga-tuples.js
   ```

## Environment variables

| Variable | Purpose |
|---|---|
| `PORT` | Port the app listens on |
| `DB_HOST` / `DB_USER` / `DB_PASS` / `DB_NAME` | MySQL connection |
| `SESSION_SECRET` | Signs the session cookie |
| `NODE_ENV` | `development` or `production` |
| `TMDB_API_KEY` | Fetches posters/trailers from TMDB |
| `FGA_API_URL` / `FGA_STORE_ID` / `FGA_MODEL_ID` | OpenFGA connection and model |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google SSO |

Never commit `.env` — it's excluded via `.gitignore`. `.env.example` documents every
variable with a placeholder value.

## Running the app

```bash
npm start   # production
npm run dev # restarts on file changes (node --watch)
```

The app listens on the port set in `PORT` (defaults to `1000`).

## Useful scripts

| Script | Purpose |
|---|---|
| `scripts/backfill-accounts.js` | Migrates legacy `users`/`admins` rows into the `accounts`/`profiles` tables |
| `scripts/seed-catalog.js` | Seeds the base movie catalog |
| `scripts/seed-marvel-dc.js` / `seed-marvel-dc-batch2.js` | Seeds the full Marvel/DC catalog |
| `scripts/fetch-tmdb-media.js` / `sync-catalog-media.js` | Pulls posters/trailers from TMDB |
| `scripts/generate-clear-posters.js` | Regenerates high-resolution poster assets |
| `scripts/seed-fga-tuples.js` | Backfills OpenFGA authorization tuples for existing accounts/titles |

## Deployment

The app is deployed on Render.

- Live URL: https://node-js-ott-6.onrender.com/
- Set every variable from [Environment variables](#environment-variables) in Render's
  environment settings.
- Add both your local (`http://localhost:<PORT>/auth/google/callback`) and production
  (`https://node-js-ott-6.onrender.com/auth/google/callback`) redirect URIs to the
  Google Cloud OAuth client's authorized redirect URIs list.
