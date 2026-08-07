import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { api, ApiError } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';

// Ported from views/movie.ejs. The route itself (src/routes/catalogRoutes.js)
// still runs requireFgaPermission('can_discover', ...) before ever serving
// this shell, and GET /api/titles/:id (src/routes/apiRoutes.js) enforces the
// same check again for the data - so an undiscoverable title 404s before
// any chrome renders, same as the pre-migration EJS behavior.
export function Movie() {
    const { id } = useParams();
    const { session } = useSession();
    const [state, setState] = useState({ loading: true, movie: null, hasVideo: false, notFound: false });

    useEffect(() => {
        let cancelled = false;
        setState({ loading: true, movie: null, hasVideo: false, notFound: false });
        api
            .get(`/api/titles/${id}`)
            .then(({ movie, hasVideo }) => {
                if (!cancelled) setState({ loading: false, movie, hasVideo, notFound: false });
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 404) {
                    setState({ loading: false, movie: null, hasVideo: false, notFound: true });
                } else {
                    throw err;
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    // movie.ejs server-rendered <title> and a poster favicon per page; this
    // is the client-side equivalent so a permalink still gets a useful tab
    // title (a known, accepted tradeoff of moving off SSR - see the
    // migration plan's verification section).
    useEffect(() => {
        if (!state.movie) return;
        document.title = state.movie.title;
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = state.movie.poster;
        return () => {
            document.title = 'COMICS TV';
        };
    }, [state.movie]);

    if (state.notFound) {
        return (
            <Layout title={<h1 className="accent-text">Not found</h1>}>
                <p className="no-video-message">Movie not found.</p>
            </Layout>
        );
    }
    if (state.loading || !state.movie) {
        return <Layout title={<h1 className="accent-text">Loading&hellip;</h1>} />;
    }

    const { movie, hasVideo } = state;
    const user = session?.user;
    // en-GB reads as "31 July 2026" everywhere regardless of the visitor's
    // locale - a fixed, unambiguous format beats one that silently flips to
    // M/D/Y for US browsers on a release-date field people compare across
    // titles. timeZone: 'UTC' keeps the date's calendar day pinned to what's
    // stored, since the string arrives with no time component to localize.
    const formattedReleaseDate = movie.releaseDate
        ? new Date(`${movie.releaseDate}T00:00:00Z`).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              timeZone: 'UTC',
          })
        : 'TBA';

    // Prefer the official title logo (TMDB's title-treatment art, e.g. the
    // stylized bat-logo for "The Dark Knight Rises") over plain text when
    // one's been fetched - see scripts/fetch-title-logos.js. The text
    // title still renders (visually-hidden), so screen readers and the
    // page's <title>/SEO story are unaffected either way.
    const titleHeading = movie.logoUrl ? (
        <h1 className="movie-title-logo-wrap">
            <span className="visually-hidden">{movie.title}</span>
            <img className="movie-title-logo" src={movie.logoUrl} alt="" />
        </h1>
    ) : (
        <h1 className="accent-text">{movie.title}</h1>
    );

    return (
        <Layout title={titleHeading}>
            <div className="movie-details">
                <img src={movie.poster} alt={movie.title} />
                <div className="movie-meta">
                    <span className="release-date-pill">{formattedReleaseDate}</span>
                    {movie.imdbRating !== null && (
                        <span className="imdb-badge" title="IMDB rating">
                            <span className="imdb-badge-label">IMDb</span> {movie.imdbRating.toFixed(1)}
                        </span>
                    )}
                </div>
                {movie.synopsis && (
                    <div className="movie-synopsis">
                        <span className="movie-synopsis-label">Synopsis</span>
                        <p>{movie.synopsis}</p>
                    </div>
                )}
                {movie.cast.length > 0 && (
                    <p>
                        Cast:{' '}
                        {movie.cast.map((castMember, i) => (
                            <span key={i}>
                                {castMember.name} as {castMember.role}
                                <br />
                            </span>
                        ))}
                    </p>
                )}
                {movie.crew.length > 0 && (
                    <p>
                        Crew:{' '}
                        {movie.crew.map((crewMember, i) => (
                            <span key={i}>
                                {crewMember.name} ({crewMember.role})
                                <br />
                            </span>
                        ))}
                    </p>
                )}
                {movie.cast.length === 0 && movie.crew.length === 0 && (
                    <p className="no-video-message">Cast and crew details aren&apos;t available for this title yet.</p>
                )}

                {hasVideo ? (
                    user ? (
                        // /video/:id is a real SPA route - client-side nav.
                        <Link className="watch-now-btn" to={`/video/${movie.id}`}>
                            <svg className="watch-now-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                                <polygon points="6 3 20 12 6 21 6 3" />
                            </svg>
                            Watch Now
                        </Link>
                    ) : (
                        // /login stays an EJS page, not a SPA route - a
                        // plain <a> forces a real browser navigation
                        // instead of React Router swallowing it.
                        <a className="watch-now-btn" href={`/login?redirectTo=${encodeURIComponent(`/video/${movie.id}`)}`}>
                            <svg className="watch-now-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
                                <polygon points="6 3 20 12 6 21 6 3" />
                            </svg>
                            Watch Now
                        </a>
                    )
                ) : (
                    <p className="no-video-message">No video available yet for this title.</p>
                )}
            </div>
        </Layout>
    );
}
