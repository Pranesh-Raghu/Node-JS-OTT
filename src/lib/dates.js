// Explicit release-date parser. Deliberately does NOT use `new Date(str)` for
// non-ISO input — that parsing is implementation-defined in JS and differs
// between a dev machine's locale/timezone and a container's, which would
// silently shift dates by a day. Every format actually present in the seed
// data is handled explicitly; anything else throws rather than guessing.
'use strict';

const MONTHS = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

// Returns { date: 'YYYY-MM-DD'|null, precision: 'day'|'year'|'unknown' }
function parseReleaseDate(raw) {
    if (typeof raw !== 'string') return { date: null, precision: 'unknown' };
    const value = raw.trim();

    // 'YYYY-MM-DD' (already ISO, e.g. from the admin form)
    let m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return { date: value, precision: 'day' };

    // 'D Mon YYYY' or 'DD Mon YYYY' (e.g. "18 Mar 2021", "6 March 2009")
    m = value.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
        const [, day, monthName, year] = m;
        const month = MONTHS[monthName.slice(0, 3).toLowerCase()];
        if (!month) throw new Error(`Unrecognized month name in release date: "${raw}"`);
        return { date: `${year}-${month}-${day.padStart(2, '0')}`, precision: 'day' };
    }

    // Bare year only (e.g. "1944", or an announced "2028")
    m = value.match(/^(\d{4})$/);
    if (m) return { date: `${m[1]}-01-01`, precision: 'year' };

    throw new Error(`Unrecognized release date format: "${raw}"`);
}

// src/db/pool.js's type parser (see its comment) returns TIMESTAMP columns
// as naive 'YYYY-MM-DD HH:MM:SS[.ffffff]' strings, with no 'T' separator
// and no timezone marker - `new Date(naive)` on that exact shape is
// Invalid Date in Safari (and implementation-defined generally, the same
// footgun parseReleaseDate above avoids). The DB session's timezone is UTC
// (Neon's default, unconfigured here), so the wall-clock value already IS
// UTC - this just makes that explicit so JSON API responses carry a real
// ISO-8601 timestamp the client can parse anywhere.
function timestampToIso(naive) {
    if (!naive) return null;
    return `${naive.replace(' ', 'T')}Z`;
}

module.exports = { parseReleaseDate, timestampToIso };
