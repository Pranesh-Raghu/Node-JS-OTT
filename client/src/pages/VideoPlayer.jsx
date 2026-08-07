import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { api, ApiError } from '../lib/api.js';
import { usePlaybackResume } from '../hooks/usePlaybackResume.js';

// Ported from views/videoplayer.ejs. requireApiLogin + requireFgaPermission
// ('can_play', {tier:'strict'}) on GET /api/titles/:id/playable
// (src/routes/apiRoutes.js) mirror the shell route's own guards
// (src/routes/catalogRoutes.js) - a 401 here is handled globally by
// client/src/lib/api.js (redirects to /login), so this component only
// needs to handle the 404 case explicitly.
export function VideoPlayer() {
    const { id } = useParams();
    const [state, setState] = useState({ loading: true, video: null, notFound: false });
    const videoRef = useRef(null);
    usePlaybackResume(videoRef, state.video?.type === 'file' ? id : null);

    useEffect(() => {
        let cancelled = false;
        setState({ loading: true, video: null, notFound: false });
        api
            .get(`/api/titles/${id}/playable`)
            .then(({ video }) => {
                if (!cancelled) setState({ loading: false, video, notFound: false });
            })
            .catch((err) => {
                if (cancelled) return;
                if (err instanceof ApiError && err.status === 404) {
                    setState({ loading: false, video: null, notFound: true });
                } else {
                    throw err;
                }
            });
        return () => {
            cancelled = true;
        };
    }, [id]);

    useEffect(() => {
        if (state.video) document.title = state.video.title;
        return () => {
            document.title = 'COMICS TV';
        };
    }, [state.video]);

    if (state.notFound) {
        return (
            <Layout title={<h1 className="accent-text">Not found</h1>}>
                <p className="no-video-message">Video not found.</p>
            </Layout>
        );
    }
    if (state.loading || !state.video) {
        return <Layout title={<h1 className="accent-text">Loading&hellip;</h1>} />;
    }

    const { video } = state;

    return (
        <Layout title={<h1 className="accent-text">{video.title}</h1>}>
            <div className="video-player-container">
                {video.type === 'youtube' ? (
                    <>
                        <p className="trailer-note">Official trailer</p>
                        <div className="video-embed">
                            <iframe
                                src={`https://www.youtube.com/embed/${video.youtubeKey}`}
                                title={`${video.title} trailer`}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    </>
                ) : (
                    <video ref={videoRef} id="video" controls preload="metadata">
                        <source src={video.src} type="video/mp4" />
                        Your browser does not support the video tag.
                    </video>
                )}
            </div>
        </Layout>
    );
}
