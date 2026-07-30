// MySQL-backed catalog repository, replacing the data.json-backed
// catalogRepo.js as the app's single source of truth for movies/videos.
const { pool, withTransaction } = require('../db/pool');

async function countPublished() {
    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM titles WHERE status = 'published' AND deleted_at IS NULL"
    );
    return rows[0].total;
}

async function listPublished({ limit, offset }) {
    const [rows] = await pool.query(
        `SELECT id, title, poster_url, release_date, trailer_youtube_key
         FROM titles
         WHERE status = 'published' AND deleted_at IS NULL
         ORDER BY release_date ASC, id ASC
         LIMIT ? OFFSET ?`,
        [limit, offset]
    );
    return rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        poster: r.poster_url,
        releaseDate: r.release_date,
        trailerYoutubeKey: r.trailer_youtube_key,
    }));
}

// Server-side search across the whole catalog, not just the current page.
// Uses .query() rather than .execute() for the LIMIT placeholder, matching
// listPublished above - mysql2's prepared-statement path (.execute()) has a
// long-standing quirk where a bound LIMIT parameter isn't reliably accepted.
async function searchPublished(query, { limit = 30 } = {}) {
    const [rows] = await pool.query(
        `SELECT id, title, poster_url, release_date, trailer_youtube_key
         FROM titles
         WHERE status = 'published' AND deleted_at IS NULL AND title LIKE ?
         ORDER BY title ASC
         LIMIT ?`,
        [`%${query}%`, limit]
    );
    return rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        poster: r.poster_url,
        releaseDate: r.release_date,
        trailerYoutubeKey: r.trailer_youtube_key,
    }));
}

async function findById(id) {
    const [rows] = await pool.execute(
        `SELECT id, title, poster_url, release_date, trailer_youtube_key, status
         FROM titles WHERE id = ? AND deleted_at IS NULL`,
        [id]
    );
    if (rows.length === 0) return null;
    const row = rows[0];

    const [creditRows] = await pool.execute(
        `SELECT tc.credit_type, tc.role, p.name
         FROM title_credits tc
         JOIN people p ON p.id = tc.person_id
         WHERE tc.title_id = ?
         ORDER BY tc.credit_type, tc.billing_order`,
        [id]
    );

    return {
        id: String(row.id),
        title: row.title,
        poster: row.poster_url,
        releaseDate: row.release_date,
        trailerYoutubeKey: row.trailer_youtube_key,
        cast: creditRows.filter((c) => c.credit_type === 'cast').map((c) => ({ name: c.name, role: c.role })),
        crew: creditRows.filter((c) => c.credit_type === 'crew').map((c) => ({ name: c.name, role: c.role })),
    };
}

async function findPlayableById(id) {
    const [rows] = await pool.execute(
        `SELECT va.source_url, va.label
         FROM video_assets va
         WHERE va.title_id = ? AND va.asset_type = 'feature' AND va.status = 'ready'`,
        [id]
    );
    if (rows.length > 0) {
        return { type: 'file', title: rows[0].label, src: rows[0].source_url };
    }

    const [titleRows] = await pool.execute(
        'SELECT title, trailer_youtube_key FROM titles WHERE id = ?',
        [id]
    );
    if (titleRows.length > 0 && titleRows[0].trailer_youtube_key) {
        return { type: 'youtube', title: titleRows[0].title, youtubeKey: titleRows[0].trailer_youtube_key };
    }
    return null;
}

async function upsertPerson(conn, name) {
    const trimmed = name.trim().replace(/\s+/g, ' ');
    const [existing] = await conn.execute('SELECT id FROM people WHERE LOWER(name) = LOWER(?)', [trimmed]);
    if (existing.length > 0) return existing[0].id;

    const { ulid } = require('ulid');
    const { uniqueSlug } = require('../lib/slug');
    const [slugRows] = await conn.execute('SELECT slug FROM people');
    const seen = new Set(slugRows.map((r) => r.slug));
    const slug = uniqueSlug(trimmed, seen);

    const [result] = await conn.execute(
        'INSERT INTO people (ulid, slug, name) VALUES (?, ?, ?)',
        [ulid(), slug, trimmed]
    );
    return result.insertId;
}

async function createTitle({ title, releaseDate, poster, cast, crew }) {
    const { ulid } = require('ulid');
    const { uniqueSlug } = require('../lib/slug');
    const { parseReleaseDate } = require('../lib/dates');
    const webhookRepo = require('./webhookRepo');

    return withTransaction(async (conn) => {
        const [slugRows] = await conn.execute('SELECT slug FROM titles');
        const seen = new Set(slugRows.map((r) => r.slug));
        const slug = uniqueSlug(title, seen);
        const { date, precision } = parseReleaseDate(releaseDate);

        const [result] = await conn.execute(
            `INSERT INTO titles (ulid, slug, kind, title, release_date, release_date_precision, poster_url, status, published_at)
             VALUES (?, ?, 'movie', ?, ?, ?, ?, 'published', NOW())`,
            [ulid(), slug, title, date, precision, poster]
        );
        const titleId = result.insertId;

        // Enqueue webhook deliveries in the same transaction as the title
        // insert, not as a separate step afterwards -- otherwise a crash
        // between the two could silently drop the event for subscribers.
        await webhookRepo.enqueueForEvent(conn, {
            eventType: 'title.published',
            buildPayload: (eventId) => ({
                event_id: eventId,
                event_type: 'title.published',
                title_id: String(titleId),
                title,
                occurred_at: new Date().toISOString(),
            }),
        });

        await insertCredits(conn, titleId, cast, crew);

        return { id: String(titleId), title, releaseDate: date, poster, cast, crew };
    });
}

async function insertCredits(conn, titleId, cast, crew) {
    let billing = 0;
    for (const c of cast || []) {
        const personId = await upsertPerson(conn, c.name);
        await conn.execute(
            `INSERT IGNORE INTO title_credits (title_id, person_id, credit_type, role, billing_order)
             VALUES (?, ?, 'cast', ?, ?)`,
            [titleId, personId, c.role || '', billing]
        );
        billing += 1;
    }
    billing = 0;
    for (const c of crew || []) {
        const personId = await upsertPerson(conn, c.name);
        await conn.execute(
            `INSERT IGNORE INTO title_credits (title_id, person_id, credit_type, role, department, billing_order)
             VALUES (?, ?, 'crew', ?, 'Directing', ?)`,
            [titleId, personId, c.role || '', billing]
        );
        billing += 1;
    }
}

// Used by scripts/backfill-credits.js to add cast/crew to a title that
// already exists but was seeded without them (see createTitle above for the
// same logic used at creation time).
async function addCreditsForTitle(titleId, cast, crew) {
    return withTransaction((conn) => insertCredits(conn, titleId, cast, crew));
}

async function listTitlesMissingCredits() {
    // Some titles have crew (director) rows but zero cast rows - checking
    // for "any credit at all" (as an earlier version of this query did)
    // missed those. This checks cast specifically, since that's the gap
    // that actually shows up on the movie details page.
    const [rows] = await pool.query(
        `SELECT t.id, t.title, t.release_date
         FROM titles t
         LEFT JOIN title_credits tc ON tc.title_id = t.id AND tc.credit_type = 'cast'
         WHERE t.status = 'published' AND t.deleted_at IS NULL
         GROUP BY t.id
         HAVING COUNT(tc.title_id) = 0`
    );
    return rows.map((r) => ({ id: r.id, title: r.title, releaseDate: r.release_date }));
}

async function listForAdminSelect() {
    const [rows] = await pool.query(
        'SELECT id, title FROM titles WHERE deleted_at IS NULL ORDER BY title ASC'
    );
    return rows.map((r) => ({ id: String(r.id), title: r.title }));
}

async function createVideoAsset({ titleId, label, src }) {
    const { ulid } = require('ulid');
    await pool.execute(
        `INSERT INTO video_assets (ulid, title_id, label, asset_type, source_url, status)
         VALUES (?, ?, ?, 'feature', ?, 'ready')`,
        [ulid(), titleId, label, src]
    );
}

module.exports = {
    countPublished,
    listPublished,
    searchPublished,
    findById,
    findPlayableById,
    createTitle,
    addCreditsForTitle,
    listTitlesMissingCredits,
    createVideoAsset,
    listForAdminSelect,
};
