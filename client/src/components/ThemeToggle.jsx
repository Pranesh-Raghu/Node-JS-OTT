import { useSession } from '../context/SessionContext.jsx';
import { api } from '../lib/api.js';
import { Icon } from './Icon.jsx';

// Replaces the GET /theme/toggle + Referer-redirect + full page reload
// (views/partials/theme-toggle.ejs, src/routes/themeRoutes.js) with a POST
// that flips the `theme` cookie server-side (same cookie, same options -
// see src/routes/themeRoutes.js's shared helper) and updates the DOM
// in place. GET /theme/toggle still exists for the EJS pages that remain.
export function ThemeToggle() {
    const { session, refresh } = useSession();
    const isLight = session?.theme === 'light';

    async function handleToggle() {
        const next = isLight ? 'dark' : 'light';
        await api.post('/api/theme', { theme: next });
        document.documentElement.dataset.theme = next;
        await refresh();
    }

    const label = isLight ? 'Switch to dark mode' : 'Switch to light mode';
    return (
        <button type="button" className="theme-toggle-btn" title={label} aria-label={label} onClick={handleToggle}>
            <Icon name={isLight ? 'moon' : 'sun'} />
        </button>
    );
}
