import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { MovieCard } from '../components/MovieCard.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { api } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';
import { useToast } from '../context/ToastContext.jsx';

// Ported from views/home.ejs. Two independent data sources, same as the
// pre-migration split: the paginated catalog (GET /api/catalog) and, once
// a search query is typed, GET /api/search - the old script.js comment
// explaining why search needs a real request (the grid is paginated 24 at
// a time, so a DOM-only filter silently missed the rest of the catalog)
// still applies unchanged.
const SEARCH_DEBOUNCE_MS = 300;

export function Home() {
    const [searchParams] = useSearchParams();
    const { session } = useSession();
    const showToast = useToast();
    const requestedPage = parseInt(searchParams.get('page'), 10) || 1;

    const [catalog, setCatalog] = useState({ movies: [], pagination: null, loading: true });
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null); // null = not searching

    useEffect(() => {
        let cancelled = false;
        setCatalog((prev) => ({ ...prev, loading: true }));
        api.get(`/api/catalog?page=${requestedPage}`).then((data) => {
            if (!cancelled) setCatalog({ ...data, loading: false });
        });
        return () => {
            cancelled = true;
        };
    }, [requestedPage]);

    useEffect(() => {
        const trimmed = query.trim();
        if (!trimmed) {
            setSearchResults(null);
            return;
        }
        const handle = setTimeout(() => {
            api.get(`/api/search?q=${encodeURIComponent(trimmed)}`).then(({ movies }) => setSearchResults(movies));
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(handle);
    }, [query]);

    async function handleAddToWatchlist(movie) {
        try {
            const { added } = await api.post('/api/watchlist', { titleId: movie.id });
            showToast(added ? 'success' : 'info', added ? `Added "${movie.title}" to your watchlist` : `"${movie.title}" is already in your watchlist`);
        } catch {
            showToast('error', 'Could not update your watchlist. Please try again.');
        }
    }

    const user = session?.user;
    const isSearching = searchResults !== null;
    const moviesToShow = isSearching ? searchResults : catalog.movies;

    return (
        <Layout
            showHome={false}
            title={
                <Link className="brand" to="/">
                    <h1>
                        COMICS <span className="accent-text">TV</span>
                    </h1>
                </Link>
            }
            search={<input type="text" id="search-bar" placeholder="Search for movies..." value={query} onChange={(e) => setQuery(e.target.value)} />}
        >
            <div className="content">
                <video autoPlay muted loop playsInline id="myVideo" className="home">
                    <source src="https://res.cloudinary.com/dhrqc7m0s/video/upload/v1736396468/Venom_pdrw5c.mp4" type="video/mp4" />
                </video>
                <h1>
                    Venom <span className="accent-text">The Last Dance </span>(2024)
                </h1>
                <br />
                <h3>
                    After the events of Venom: Let There Be Carnage (2021), Eddie Brock and the symbiote Venom go on the run when
                    they are hunted by both of their worlds.
                </h3>
            </div>
            <section>
                <div className="movie-gallery">
                    {moviesToShow.map((movie) => (
                        <MovieCard key={movie.id} movie={movie} loggedIn={Boolean(user)} onAddToWatchlist={handleAddToWatchlist} />
                    ))}
                </div>
                {!isSearching && <Pagination pagination={catalog.pagination} />}
            </section>
        </Layout>
    );
}
