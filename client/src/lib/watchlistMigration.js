import { api } from './api.js';

const WATCHLIST_KEY = 'watchlist'; // same key public/Javascript/script.js used
const MIGRATED_FLAG = 'watchlistMigrated';

// One-time backfill of the old localStorage watchlist into the server-side
// table (see migrations/20260807000001_watchlist.js). Runs once per logged-
// in session bootstrap (see SessionContext) - a no-op for anyone who never
// had a localStorage watchlist, or who's already been migrated.
//
// Never deletes the localStorage key before a CONFIRMED successful import -
// if the request fails, both the key and the "not yet migrated" state
// survive untouched, so the next session bootstrap retries it rather than
// silently losing the user's list.
export async function migrateWatchlistFromLocalStorage() {
    if (localStorage.getItem(MIGRATED_FLAG) === '1') return;

    let raw;
    try {
        raw = localStorage.getItem(WATCHLIST_KEY);
    } catch {
        return; // localStorage unavailable (private browsing, etc.) - nothing to migrate
    }
    if (!raw) {
        localStorage.setItem(MIGRATED_FLAG, '1');
        return;
    }

    let items;
    try {
        items = JSON.parse(raw);
    } catch {
        // Corrupt value - can't do anything useful with it, but don't keep
        // retrying against unparseable data forever either.
        localStorage.setItem(MIGRATED_FLAG, '1');
        return;
    }
    if (!Array.isArray(items) || items.length === 0) {
        localStorage.setItem(MIGRATED_FLAG, '1');
        return;
    }

    try {
        await api.post('/api/watchlist/import', { titleIds: items.map((item) => item.id) });
    } catch {
        return; // leave everything as-is; retried on the next bootstrap
    }

    localStorage.setItem(MIGRATED_FLAG, '1');
    localStorage.removeItem(WATCHLIST_KEY);
}
