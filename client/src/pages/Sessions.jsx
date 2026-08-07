import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

// Ported from views/account/sessions.ejs. The old ?message=/?error= query-
// string flash pattern (POST-Redirect-GET) is replaced by toasts fed
// directly from each mutation's response - see the migration plan's
// component-structure notes on why that's true across all 3 account pages.
export function Sessions() {
    const showToast = useToast();
    const [sessions, setSessions] = useState(null); // null = still loading

    useEffect(() => {
        api.get('/api/account/sessions').then(({ sessions: loaded }) => setSessions(loaded));
    }, []);

    async function handleRevoke(device) {
        try {
            const result = await api.delete(`/api/account/sessions/${encodeURIComponent(device.sessionId)}`);
            if (result.selfRevoked) {
                // Own session is gone server-side already - full navigation
                // to /login, same as the pre-migration redirect.
                window.location.assign('/login');
                return;
            }
            setSessions((prev) => prev.filter((s) => s.sessionId !== device.sessionId));
            showToast('info', 'Device signed out.');
        } catch {
            showToast('error', 'That session could not be found.');
        }
    }

    async function handleRevokeAll() {
        try {
            await api.delete('/api/account/sessions');
            window.location.assign('/login');
        } catch {
            showToast('error', 'Could not sign out of every device. Please try again.');
        }
    }

    return (
        <Layout
            title={
                // sessions.ejs/webhooks.ejs/profile.ejs used a plain brand
                // link here, unlike home.ejs's <a class="brand">, or movie/
                // videoplayer/watchlist's page-specific <h1> - reproduced
                // faithfully rather than "fixed", since it's not this
                // migration's job to change page chrome.
                <Link to="/">
                    <h1>
                        COMICS <span className="accent-text">TV</span>
                    </h1>
                </Link>
            }
        >
            <div className="form-card">
                <h2>
                    Your <span className="accent-text">sessions</span>
                </h2>
                <p className="text-muted">Devices and browsers currently signed in to your account.</p>

                {sessions && sessions.length === 0 && <p>No active sessions found.</p>}

                {sessions && sessions.length > 0 && (
                    <>
                        <ul className="device-list">
                            {sessions.map((device) => (
                                <li key={device.sessionId} className="device-item">
                                    <div className="device-item-info">
                                        <strong>
                                            {device.label}
                                            {device.isCurrent && <span className="badge-current">This device</span>}
                                        </strong>
                                        <span className="device-location">Location: {device.locationLabel}</span>
                                        <span className="text-muted">First seen: {new Date(device.firstSeenAt).toLocaleString()}</span>
                                        <span className="text-muted">Last seen: {new Date(device.lastSeenAt).toLocaleString()}</span>
                                    </div>
                                    <button type="button" onClick={() => handleRevoke(device)}>
                                        {device.isCurrent ? 'Sign out' : 'Sign out this device'}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <button type="button" onClick={handleRevokeAll}>
                            Sign out everywhere
                        </button>
                    </>
                )}
            </div>
        </Layout>
    );
}
