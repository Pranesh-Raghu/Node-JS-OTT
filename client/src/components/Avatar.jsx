import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

// Direct port of the fallback chain in public/Javascript/script.js
// (js-avatar-chain) + views/partials/avatar.ejs. Priority: Gravatar (404s
// if the user has none registered - see src/lib/avatar.js) -> a custom
// uploaded avatarUrl -> the initial-letter span, which is always what's
// rendered first. Each candidate is preloaded with a detached Image() and
// only swapped in on a confirmed load, so a user with no Gravatar picture
// (the common case, since Gravatar is queried with d=404) never sees a
// flash of the browser's native broken-image icon.
function useImageFallback(candidates) {
    const [resolvedSrc, setResolvedSrc] = useState(null);

    useEffect(() => {
        setResolvedSrc(null);
        let cancelled = false;
        let probe = null;

        (async () => {
            for (const candidate of candidates) {
                if (!candidate) continue;
                const loaded = await new Promise((resolve) => {
                    probe = new Image();
                    probe.onload = () => resolve(true);
                    probe.onerror = () => resolve(false);
                    probe.src = candidate;
                });
                if (cancelled) return;
                if (loaded) {
                    setResolvedSrc(candidate);
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
            if (probe) probe.onload = probe.onerror = null;
        };
        // candidates is a small array of strings/null; join so the effect
        // doesn't re-run on every render from a new array identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [candidates.join('|')]);

    return resolvedSrc;
}

export function Avatar({ username, email, avatarUrl, gravatarUrl, initial, color, linkToProfile = true }) {
    const resolvedSrc = useImageFallback([gravatarUrl, avatarUrl]);
    const alt = `${username}'s profile picture`;

    const content = (
        <span className="avatar-wrapper">
            {resolvedSrc ? (
                <img className="avatar avatar-img" src={resolvedSrc} alt={alt} />
            ) : (
                <span className="avatar avatar-initial" style={{ backgroundColor: color }}>
                    {initial}
                </span>
            )}
        </span>
    );

    if (!linkToProfile) return content;
    return (
        <Link to="/account/profile" title="Profile" aria-label="Profile">
            {content}
        </Link>
    );
}
