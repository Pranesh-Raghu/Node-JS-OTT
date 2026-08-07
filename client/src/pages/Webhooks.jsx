import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { api, ApiError } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

// Ported from views/account/webhooks.ejs. The one-time secret reveal used
// to arrive via a redirect query string (?newSecret=...) - a real security
// downgrade (it lands in access logs, browser history, and any subsequent
// same-origin Referer). Here it comes back directly in the
// POST /api/account/webhooks response body and is held in local state
// only, never touching a URL - see src/controllers/api/webhooksController.js.
export function Webhooks() {
    const showToast = useToast();
    const [data, setData] = useState(null); // { endpoints, availableEvents }
    const [url, setUrl] = useState('');
    const [selectedEvents, setSelectedEvents] = useState([]);
    const [formError, setFormError] = useState(null);
    const [revealedSecret, setRevealedSecret] = useState(null); // { id, secret }
    const [submitting, setSubmitting] = useState(false);

    async function load() {
        const result = await api.get('/api/account/webhooks');
        setData(result);
    }

    useEffect(() => {
        load();
    }, []);

    function toggleEventSelection(eventType) {
        setSelectedEvents((prev) => (prev.includes(eventType) ? prev.filter((e) => e !== eventType) : [...prev, eventType]));
    }

    async function handleCreate(e) {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);
        try {
            const result = await api.post('/api/account/webhooks', { url, eventTypes: selectedEvents });
            setRevealedSecret({ id: result.id, secret: result.secret });
            setUrl('');
            setSelectedEvents([]);
            await load();
        } catch (err) {
            setFormError(err instanceof ApiError ? err.message : 'Could not create that endpoint. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleToggle(endpoint) {
        try {
            await api.post(`/api/account/webhooks/${endpoint.id}/toggle`);
            await load();
        } catch {
            showToast('error', 'Could not update that endpoint. Please try again.');
        }
    }

    async function handleDelete(endpoint) {
        try {
            await api.delete(`/api/account/webhooks/${endpoint.id}`);
            await load();
        } catch {
            showToast('error', 'Could not delete that endpoint. Please try again.');
        }
    }

    return (
        <Layout
            title={
                <Link to="/">
                    <h1>
                        COMICS <span className="accent-text">TV</span>
                    </h1>
                </Link>
            }
        >
            <div className="form-card">
                <h2>
                    Webhook <span className="accent-text">endpoints</span>
                </h2>
                <p className="text-muted">
                    Get an HTTP POST notification when a subscribed event happens. Deliveries are signed with an HMAC secret shown
                    once, at creation time.
                </p>

                {formError && <p className="error-message">{formError}</p>}
                {revealedSecret && (
                    <>
                        <p className="success-message">Endpoint created. Copy this secret now &mdash; it will not be shown again.</p>
                        <div className="secret-reveal">{revealedSecret.secret}</div>
                    </>
                )}

                <form onSubmit={handleCreate}>
                    <label htmlFor="url">Endpoint URL</label>
                    <input
                        type="text"
                        id="url"
                        name="url"
                        placeholder="https://example.com/webhooks/comics-tv"
                        required
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                    />
                    <br />

                    <span>Event types</span>
                    <div className="event-type-checkboxes">
                        {(data?.availableEvents || []).map((eventType) => (
                            <label key={eventType}>
                                <input
                                    type="checkbox"
                                    name="event_types"
                                    value={eventType}
                                    checked={selectedEvents.includes(eventType)}
                                    onChange={() => toggleEventSelection(eventType)}
                                />
                                <code>{eventType}</code>
                            </label>
                        ))}
                    </div>

                    <button type="submit" disabled={submitting}>
                        Add endpoint
                    </button>
                </form>
            </div>

            <div className="form-card">
                <h2>
                    Your <span className="accent-text">endpoints</span>
                </h2>
                {data && data.endpoints.length === 0 && <p>No webhook endpoints configured yet.</p>}
                {data && data.endpoints.length > 0 && (
                    <ul className="webhook-list">
                        {data.endpoints.map((endpoint) => (
                            <li key={endpoint.id} id={`endpoint-${endpoint.id}`} className="webhook-item">
                                <div className="webhook-item-info">
                                    <strong>
                                        {endpoint.url}
                                        {endpoint.status === 'disabled' && <span className="badge-status-disabled">Disabled</span>}
                                    </strong>
                                    <span className="text-muted">Events: {endpoint.eventTypes.join(', ')}</span>
                                    <span className="text-muted">Created: {new Date(endpoint.createdAt).toLocaleString()}</span>
                                    <span className="text-muted">Consecutive failures: {endpoint.consecutiveFailures}</span>

                                    {endpoint.deliveries.length > 0 && (
                                        <ul className="delivery-list">
                                            {endpoint.deliveries.map((delivery, i) => (
                                                <li key={i}>
                                                    {delivery.eventType} &mdash; {delivery.status} (attempt {delivery.attempts}
                                                    {delivery.lastError && <>, last error: {delivery.lastError}</>})
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div>
                                    <button type="button" onClick={() => handleToggle(endpoint)}>
                                        {endpoint.status === 'enabled' ? 'Disable' : 'Enable'}
                                    </button>
                                    <button type="button" onClick={() => handleDelete(endpoint)}>
                                        Delete
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </Layout>
    );
}
