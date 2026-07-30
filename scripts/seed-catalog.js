// Migrates data.json (movies/videos) into the Phase 3 MySQL schema:
// titles, people, title_credits, video_assets. Idempotent — keyed on
// legacy_id, safe to re-run (upserts rather than duplicating).
//
// Known-broken video/movie pairings (content mismatch or missing file,
// found during the original codebase audit) are explicitly flagged rather
// than silently migrated forward as if they worked:
//   - video legacy_id "3":  local path doesn't exist on disk
//   - video legacy_id "17": actually a Superman clip, mislabeled under
//                           "The Batman 2" (movie legacy_id "17")
//   - video legacy_id "18": actually an unrelated Deadpool clip, mislabeled
//                           as "Flashpoint Paradox"
'use strict';
require('dotenv').config();
const { ulid } = require('ulid');
const { pool } = require('../src/db/pool');
const { parseReleaseDate } = require('../src/lib/dates');
const { uniqueSlug } = require('../src/lib/slug');

const BROKEN_VIDEO_LEGACY_IDS = new Set(['3', '17', '18']);

function normalizePersonName(name) {
    return name.trim().replace(/\s+/g, ' ');
}

async function upsertPerson(conn, nameCache, rawName) {
    const name = normalizePersonName(rawName);
    const key = name.toLowerCase();
    if (nameCache.has(key)) return nameCache.get(key);

    const [existingRows] = await conn.execute('SELECT id FROM people WHERE LOWER(name) = ?', [key]);
    if (existingRows.length > 0) {
        nameCache.set(key, existingRows[0].id);
        return existingRows[0].id;
    }

    const [slugRows] = await conn.execute('SELECT slug FROM people');
    const seenSlugs = new Set(slugRows.map((r) => r.slug));
    const slug = uniqueSlug(name, seenSlugs);

    const [rows] = await conn.execute(
        'INSERT INTO people (ulid, slug, name) VALUES (?, ?, ?) RETURNING id',
        [ulid(), slug, name]
    );
    nameCache.set(key, rows[0].id);
    return rows[0].id;
}

async function main() {
    const data = require('../data.json');
    const conn = pool;

    const [existingTitleSlugRows] = await conn.execute('SELECT slug FROM titles');
    const seenTitleSlugs = new Set(existingTitleSlugRows.map((r) => r.slug));
    const personNameCache = new Map();

    let titlesCreated = 0;
    let titlesSkipped = 0;
    let creditsCreated = 0;
    let assetsCreated = 0;
    let assetsBroken = 0;
    let assetsSkippedNoFeature = 0;

    for (const movie of data.movies) {
        const [existing] = await conn.execute('SELECT id FROM titles WHERE legacy_id = ?', [movie.id]);
        if (existing.length > 0) {
            titlesSkipped += 1;
            continue;
        }

        const { date, precision } = parseReleaseDate(movie.releaseDate);
        const slug = uniqueSlug(movie.title, seenTitleSlugs);

        const [titleRows] = await conn.execute(
            `INSERT INTO titles
               (ulid, slug, legacy_id, kind, title, release_date, release_date_precision,
                poster_url, status, published_at)
             VALUES (?, ?, ?, 'movie', ?, ?, ?, ?, 'published', NOW()) RETURNING id`,
            [ulid(), slug, movie.id, movie.title, date, precision, movie.poster]
        );
        const titleId = titleRows[0].id;
        titlesCreated += 1;

        let billing = 0;
        for (const castMember of movie.cast || []) {
            const personId = await upsertPerson(conn, personNameCache, castMember.name);
            await conn.execute(
                `INSERT INTO title_credits
                   (title_id, person_id, credit_type, role, billing_order)
                 VALUES (?, ?, 'cast', ?, ?)
                 ON CONFLICT (title_id, person_id, credit_type, role) DO NOTHING`,
                [titleId, personId, castMember.role || '', billing]
            );
            billing += 1;
            creditsCreated += 1;
        }
        billing = 0;
        for (const crewMember of movie.crew || []) {
            const personId = await upsertPerson(conn, personNameCache, crewMember.name);
            await conn.execute(
                `INSERT INTO title_credits
                   (title_id, person_id, credit_type, role, department, billing_order)
                 VALUES (?, ?, 'crew', ?, 'Directing', ?)
                 ON CONFLICT (title_id, person_id, credit_type, role) DO NOTHING`,
                [titleId, personId, crewMember.role || '', billing]
            );
            billing += 1;
            creditsCreated += 1;
        }

        const video = data.videos.find((v) => v.id === movie.id);
        if (video) {
            const isBroken = BROKEN_VIDEO_LEGACY_IDS.has(video.id);
            await conn.execute(
                `INSERT INTO video_assets
                   (ulid, title_id, legacy_id, label, asset_type, source_url, status)
                 VALUES (?, ?, ?, ?, 'feature', ?, ?)`,
                [ulid(), titleId, video.id, movie.title, video.src, isBroken ? 'broken' : 'ready']
            );
            if (isBroken) assetsBroken += 1;
            else assetsCreated += 1;
        } else {
            assetsSkippedNoFeature += 1;
        }
    }

    console.log('Seed complete:');
    console.log(`  titles created: ${titlesCreated}, skipped (already migrated): ${titlesSkipped}`);
    console.log(`  credits created: ${creditsCreated}`);
    console.log(`  video assets ready: ${assetsCreated}, flagged broken: ${assetsBroken}, titles with no video: ${assetsSkippedNoFeature}`);

    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
