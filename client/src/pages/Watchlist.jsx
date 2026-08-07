import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { api } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

// Ported from views/watchlist.ejs + the watchlist block in
// public/Javascript/script.js. Unlike the home page's paginated search,
// this page already has every item loaded (watchlists are small, and
// there's no pagination here either, then or now), so a pure client-side
// filter over the already-fetched list is correct - no request per
// keystroke needed.
export function Watchlist() {
    const showToast = useToast();
    const [items, setItems] = useState(null); // null = still loading
    const [query, setQuery] = useState('');

    useEffect(() => {
        api.get('/api/watchlist').then(({ items: loaded }) => setItems(loaded));
    }, []);

    async function handleRemove(item) {
        try {
            await api.delete(`/api/watchlist/${item.id}`);
            setItems((prev) => prev.filter((i) => i.id !== item.id));
            showToast('info', `Removed "${item.title}" from your watchlist`);
        } catch {
            showToast('error', 'Could not remove that title. Please try again.');
        }
    }

    const visibleItems = items ? items.filter((item) => item.title.toLowerCase().includes(query.trim().toLowerCase())) : [];

    return (
        <Layout
            title={
                <h1>
                    YOUR <span className="accent-text">WATCHLIST</span>
                </h1>
            }
            search={<input type="text" id="search-bar" placeholder="Search for a movie..." value={query} onChange={(e) => setQuery(e.target.value)} />}
        >
            <div className="watchlist-container">
                <div className="subwatchlist_container">
                    {items && items.length === 0 && (
                        <div className="watchlist-empty-state">
                            <h2>
                                Your watchlist is <span className="empty-label">empty</span>
                            </h2>
                            <p className="text-muted">Movies you add will show up here so you can pick up where you left off.</p>
                            <Link className="watch-now-btn" to="/">
                                Browse movies
                            </Link>
                        </div>
                    )}
                    {visibleItems.map((item) => (
                        <div key={item.id} className="watchlist-item">
                            <img src={item.poster} alt={item.title} className="watchlist-poster" />
                            <Link to={`/movie/${item.id}`} className="watchlist-title">
                                {item.title}
                            </Link>
                            <button type="button" className="remove-from-watchlist-btn" onClick={() => handleRemove(item)}>
                                Remove
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </Layout>
    );
}
