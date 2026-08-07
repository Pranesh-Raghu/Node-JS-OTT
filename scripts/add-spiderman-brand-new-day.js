// One-off: adds "Spider-Man: Brand New Day" to the catalog. Goes straight
// through titleRepo.createTitle - the same DB-backed path the admin
// "Add movie" API uses (see src/controllers/api/adminController.js) - since
// titleRepo.js is the app's single source of truth, not data.json (that
// file only feeds the legacy scripts/seed-catalog.js migration).
//
// Run: node scripts/add-spiderman-brand-new-day.js
'use strict';
require('dotenv').config();
const titleRepo = require('../src/repositories/titleRepo');
const { pool } = require('../src/db/pool');

async function main() {
    const movie = await titleRepo.createTitle({
        title: 'Spider-Man: Brand New Day',
        releaseDate: '31 Jul 2026',
        poster: 'public/images/default.webp',
        cast: [{ name: 'Tom Holland', role: 'Peter Parker / Spider-Man' }],
        crew: [{ name: 'Destin Daniel Cretton', role: 'Director' }],
    });
    console.log('Added:', movie);
    await pool.end();
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
