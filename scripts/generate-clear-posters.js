// Replaces the generic default.webp placeholder poster with a distinct,
// legible, per-title placeholder image so every movie has a visually clear,
// unique poster instead of 150+ titles sharing one identical image.
'use strict';
const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data.json');
const DEFAULT_POSTER = 'public/images/default.webp';
// 900x1350 = clean 2:3 poster aspect ratio, high enough resolution that the
// largest rendered size (movie detail page, full container width) doesn't
// upscale and blur.
const POSTER_SIZE = '900x1350';

function posterUrlFor(title) {
    const text = encodeURIComponent(title).replace(/%20/g, '+');
    return `https://placehold.co/${POSTER_SIZE}/12122b/ffffff/png?font=roboto&text=${text}`;
}

function isPlaceholderPoster(poster) {
    return poster === DEFAULT_POSTER || poster.startsWith('https://placehold.co/');
}

function main() {
    const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
    let changed = 0;
    for (const movie of data.movies) {
        if (isPlaceholderPoster(movie.poster)) {
            movie.poster = posterUrlFor(movie.title);
            changed += 1;
        }
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
    console.log(`Replaced ${changed} default posters with distinct placeholder posters.`);
}

main();
