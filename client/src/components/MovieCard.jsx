import { Link } from 'react-router-dom';

// Ported from the per-card markup in views/home.ejs. `onAddToWatchlist` is
// only provided (and only the <button> variant rendered) when the visitor
// is logged in - logged-out visitors get a plain link to /login that
// carries them back here via redirectTo, exactly like the pre-migration
// EJS branch.
export function MovieCard({ movie, loggedIn, onAddToWatchlist }) {
    return (
        <div className="movie-card">
            <Link className="movie-link" to={`/movie/${movie.id}`}>
                <img src={movie.poster} alt="" />
                <span className="movie-title">{movie.title}</span>
            </Link>
            {loggedIn ? (
                <button type="button" className="add-to-watchlist-btn" onClick={() => onAddToWatchlist(movie)}>
                    Add to Watchlist
                </button>
            ) : (
                <a className="add-to-watchlist-btn" href={`/login?redirectTo=${encodeURIComponent(`/movie/${movie.id}`)}`}>
                    Add to Watchlist
                </a>
            )}
        </div>
    );
}
