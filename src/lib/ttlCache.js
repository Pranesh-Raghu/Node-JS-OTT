// In-memory TTL cache. Deliberately not Redis/Memcached - this app runs
// as a single Render instance (see globalLimiter's own comment on the same
// tradeoff for rate limiting), so a per-process Map is the right amount of
// machinery. Swap for something shared the moment there's more than one
// instance, or a cache invalidation bug here would only affect one
// instance's view rather than staying silently wrong forever.
'use strict';

function createTtlCache({ ttlMs, maxEntries = 5000 }) {
    const store = new Map();

    function get(key) {
        const entry = store.get(key);
        if (!entry) return undefined;
        if (Date.now() >= entry.expiresAt) {
            store.delete(key);
            return undefined;
        }
        return entry.value;
    }

    function set(key, value, ttlOverrideMs) {
        // Evict the oldest entry rather than growing unbounded - Map
        // preserves insertion order, so the first key is the oldest.
        // Approximate LRU, not exact: a cache this size existing purely to
        // save a handful of round-trips doesn't need exact LRU bookkeeping.
        if (store.size >= maxEntries) {
            const oldestKey = store.keys().next().value;
            store.delete(oldestKey);
        }
        store.set(key, { value, expiresAt: Date.now() + (ttlOverrideMs ?? ttlMs) });
    }

    function del(key) {
        store.delete(key);
    }

    function clear() {
        store.clear();
    }

    return { get, set, del, clear };
}

module.exports = { createTtlCache };
