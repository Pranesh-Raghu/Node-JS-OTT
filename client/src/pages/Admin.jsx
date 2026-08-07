import { useEffect, useState } from 'react';
import { ThemeToggle } from '../components/ThemeToggle.jsx';
import { api, ApiError } from '../lib/api.js';
import { useToast } from '../context/ToastContext.jsx';

// Ported from views/admin.ejs. Deliberately NOT using the shared Layout/
// Header (client/src/components/Layout.jsx) - the original admin page has
// its own minimal chrome (just a title + theme toggle, no watchlist/
// sessions/webhooks/login nav, no footer, no script.js) and uses a
// separate admin session (req.session.admin) that the rest of the app's
// nav has no concept of. body.admin-page is still applied via useEffect
// since style.css keys off it (see Layout's own bodyClass comment).
export function Admin() {
    const showToast = useToast();
    const [titles, setTitles] = useState([]);

    const [movieForm, setMovieForm] = useState({ title: '', releaseDate: '', poster: '', cast: '', crew: '' });
    const [movieSubmitting, setMovieSubmitting] = useState(false);

    const [videoForm, setVideoForm] = useState({ titleId: '', title: '', videoLink: '' });
    const [videoSubmitting, setVideoSubmitting] = useState(false);

    useEffect(() => {
        document.body.classList.add('admin-page');
        return () => document.body.classList.remove('admin-page');
    }, []);

    async function loadTitles() {
        const { titles: loaded } = await api.get('/api/admin/titles');
        setTitles(loaded);
    }

    useEffect(() => {
        loadTitles();
    }, []);

    async function handleAddMovie(e) {
        e.preventDefault();
        setMovieSubmitting(true);
        try {
            await api.post('/api/admin/titles', movieForm);
            showToast('success', `Added "${movieForm.title}"`);
            setMovieForm({ title: '', releaseDate: '', poster: '', cast: '', crew: '' });
            await loadTitles();
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Could not add that movie.');
        } finally {
            setMovieSubmitting(false);
        }
    }

    async function handleUploadVideo(e) {
        e.preventDefault();
        setVideoSubmitting(true);
        try {
            await api.post('/api/admin/video-assets', videoForm);
            showToast('success', 'Video uploaded');
            setVideoForm({ titleId: '', title: '', videoLink: '' });
        } catch (err) {
            showToast('error', err instanceof ApiError ? err.message : 'Could not upload that video.');
        } finally {
            setVideoSubmitting(false);
        }
    }

    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <header>
                <div className="header-top">
                    <h1 className="accent-text">ADMIN PANEL</h1>
                    <nav>
                        <ThemeToggle />
                    </nav>
                </div>
            </header>
            <br />
            <main id="main">
                <div className="form-card">
                    <h2>MOVIE</h2>
                    <form onSubmit={handleAddMovie}>
                        <label htmlFor="title">Title:</label>
                        <input
                            type="text"
                            id="title"
                            required
                            value={movieForm.title}
                            onChange={(e) => setMovieForm({ ...movieForm, title: e.target.value })}
                        />
                        <br />
                        <label htmlFor="releaseDate">Release Date:</label>
                        <input
                            type="date"
                            id="releaseDate"
                            required
                            value={movieForm.releaseDate}
                            onChange={(e) => setMovieForm({ ...movieForm, releaseDate: e.target.value })}
                        />
                        <br />
                        <label htmlFor="poster">Poster URL:</label>
                        <input
                            type="text"
                            id="poster"
                            required
                            value={movieForm.poster}
                            onChange={(e) => setMovieForm({ ...movieForm, poster: e.target.value })}
                        />
                        <br />
                        <label htmlFor="cast">Cast (JSON):</label>
                        <textarea
                            id="cast"
                            required
                            value={movieForm.cast}
                            onChange={(e) => setMovieForm({ ...movieForm, cast: e.target.value })}
                        />
                        <br />
                        <label htmlFor="crew">Crew (JSON):</label>
                        <textarea
                            id="crew"
                            required
                            value={movieForm.crew}
                            onChange={(e) => setMovieForm({ ...movieForm, crew: e.target.value })}
                        />
                        <br />
                        <button type="submit" disabled={movieSubmitting}>
                            Add Movie
                        </button>
                    </form>
                </div>
                <hr />
                <div className="form-card">
                    <h2>VIDEO</h2>
                    <form onSubmit={handleUploadVideo}>
                        <label htmlFor="titleId">Movie:</label>
                        <select
                            id="titleId"
                            required
                            value={videoForm.titleId}
                            onChange={(e) => setVideoForm({ ...videoForm, titleId: e.target.value })}
                        >
                            <option value="" disabled>
                                Select a movie&hellip;
                            </option>
                            {titles.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.title}
                                </option>
                            ))}
                        </select>
                        <br />
                        <label htmlFor="videoTitle">Video label:</label>
                        <input
                            type="text"
                            id="videoTitle"
                            required
                            value={videoForm.title}
                            onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })}
                        />
                        <br />
                        <label htmlFor="videoLink">Video URL:</label>
                        <input
                            type="text"
                            id="videoLink"
                            required
                            value={videoForm.videoLink}
                            onChange={(e) => setVideoForm({ ...videoForm, videoLink: e.target.value })}
                        />
                        <br />
                        <button type="submit" disabled={videoSubmitting}>
                            Upload Video
                        </button>
                    </form>
                </div>
                <br />
            </main>
        </>
    );
}
