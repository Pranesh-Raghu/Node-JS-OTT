'use strict';

function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Case-folding, collision-aware: appends -2, -3, ... on repeats.
function uniqueSlug(text, seen) {
    const base = slugify(text) || 'untitled';
    let candidate = base;
    let n = 2;
    while (seen.has(candidate)) {
        candidate = `${base}-${n}`;
        n += 1;
    }
    seen.add(candidate);
    return candidate;
}

module.exports = { slugify, uniqueSlug };
