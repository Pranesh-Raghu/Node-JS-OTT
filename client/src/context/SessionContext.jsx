import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setCsrfToken } from '../lib/api.js';
import { migrateWatchlistFromLocalStorage } from '../lib/watchlistMigration.js';

const SessionContext = createContext(null);

// GET /api/session is always 200, even for anonymous visitors (see
// src/controllers/api/sessionController.js) - the SPA needs the CSRF token
// and theme regardless of login state, and this avoids every page having
// to special-case "session not loaded yet" vs "no session".
export function SessionProvider({ children }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        const data = await api.get('/api/session');
        setCsrfToken(data.csrfToken);
        setSession(data);
        return data;
    }, []);

    useEffect(() => {
        refresh().then((data) => {
            // Fire-and-forget: migrateWatchlistFromLocalStorage() is a
            // no-op for a logged-out visitor (nothing to migrate into yet -
            // see its own guard) and never throws.
            if (data.user) migrateWatchlistFromLocalStorage();
        }).finally(() => setLoading(false));
    }, [refresh]);

    return <SessionContext.Provider value={{ session, loading, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession() {
    const ctx = useContext(SessionContext);
    if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
    return ctx;
}
