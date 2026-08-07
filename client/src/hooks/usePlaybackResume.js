import { useEffect } from 'react';

// Direct port of the video-resume block in public/Javascript/script.js.
// Deliberately still per-device localStorage, not synced through the API -
// resume position is legitimately device-local (see the migration plan's
// watchlist section for the same reasoning applied to a feature that DID
// move server-side).
export function usePlaybackResume(videoRef, videoId) {
    useEffect(() => {
        const el = videoRef.current;
        if (!el || !videoId) return;

        const key = `videoCurrentTime:${videoId}`;

        function onLoadedMetadata() {
            const savedTime = parseFloat(localStorage.getItem(key));
            if (Number.isFinite(savedTime) && savedTime > 0 && savedTime < el.duration) {
                el.currentTime = savedTime;
            }
        }
        function onPause() {
            localStorage.setItem(key, String(el.currentTime));
        }

        el.addEventListener('loadedmetadata', onLoadedMetadata);
        el.addEventListener('pause', onPause);
        return () => {
            el.removeEventListener('loadedmetadata', onLoadedMetadata);
            el.removeEventListener('pause', onPause);
        };
    }, [videoRef, videoId]);
}
