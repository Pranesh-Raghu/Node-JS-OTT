document.addEventListener('DOMContentLoaded', () => {
    const WATCHLIST_KEY = 'watchlist';
    const getWatchlist = () => JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || [];
    const saveWatchlist = (watchlist) => {
        try {
            localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    };

    // --- Toast notifications (self-contained, no third-party CDN) ---
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        toastContainer.setAttribute('role', 'status');
        toastContainer.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastContainer);
    }

    function showToast(kind, message) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${kind}`;
        toast.textContent = message; // textContent only: no innerHTML XSS sink
        toastContainer.appendChild(toast);
        // Trigger enter animation on next frame
        requestAnimationFrame(() => toast.classList.add('toast-visible'));
        setTimeout(() => {
            toast.classList.remove('toast-visible');
            toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        }, 3200);
    }

    const showEmptyMessage = (container) => {
        container.innerHTML = '';
        const emptyMessage = document.createElement('h2');
        const label = document.createElement('span');
        label.className = 'empty-label';
        label.textContent = 'EMPTY';
        emptyMessage.append('Your Watchlist is ', label);
        container.appendChild(emptyMessage);
    };

    const appendToWatchlist = (movie, container) => {
        const item = document.createElement('div');
        item.id = `movie-${movie.id}`;
        item.className = 'watchlist-item';

        const img = document.createElement('img');
        img.src = movie.poster;
        img.alt = movie.title;
        img.className = 'watchlist-poster';

        const link = document.createElement('a');
        link.href = `/movie/${movie.id}`;
        link.className = 'watchlist-title';
        link.textContent = movie.title;

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-from-watchlist-btn';
        removeBtn.dataset.id = movie.id;
        removeBtn.textContent = 'Remove';

        item.append(img, link, removeBtn);
        container.appendChild(item);
    };

    const removeFromWatchlist = (movieId, container) => {
        const watchlist = getWatchlist();
        const movieIndex = watchlist.findIndex((item) => item.id === movieId);
        if (movieIndex === -1) return;

        const [removedMovie] = watchlist.splice(movieIndex, 1);
        saveWatchlist(watchlist);

        const movieElement = document.getElementById(`movie-${movieId}`);
        if (movieElement) movieElement.remove();

        if (container.children.length === 0) showEmptyMessage(container);

        showToast('info', `Removed "${removedMovie.title}" from your watchlist`);
    };

    // Initialize watchlist container (watchlist page only)
    const mainContainer = document.querySelector('.watchlist-container');
    if (mainContainer) {
        let watchlistContainer = mainContainer.querySelector('.subwatchlist_container');
        if (!watchlistContainer) {
            watchlistContainer = document.createElement('div');
            watchlistContainer.classList.add('subwatchlist_container');
            mainContainer.appendChild(watchlistContainer);
        } else {
            watchlistContainer.innerHTML = '';
        }

        const watchlist = getWatchlist();
        if (watchlist.length > 0) {
            watchlist.forEach((movie) => appendToWatchlist(movie, watchlistContainer));
        } else {
            showEmptyMessage(watchlistContainer);
        }

        watchlistContainer.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-from-watchlist-btn')) {
                removeFromWatchlist(event.target.getAttribute('data-id'), watchlistContainer);
            }
        });
    }

    // Add to Watchlist (home page and movie cards elsewhere)
    document.body.addEventListener('click', (event) => {
        if (!event.target.classList.contains('add-to-watchlist-btn')) return;

        const button = event.target;
        const movieCard = button.closest('.movie-card');
        const movie = {
            id: button.getAttribute('data-id'),
            title: movieCard.querySelector('.movie-title').innerText,
            poster: movieCard.querySelector('img').src,
        };

        const watchlist = getWatchlist();
        if (watchlist.some((item) => item.id === movie.id)) {
            showToast('info', `"${movie.title}" is already in your watchlist`);
            return;
        }

        watchlist.push(movie);
        saveWatchlist(watchlist);
        showToast('success', `Added "${movie.title}" to your watchlist`);

        const container = document.querySelector('.subwatchlist_container');
        if (container) appendToWatchlist(movie, container);
    });

    // Single search-bar handler, dispatched by whichever card type is present
    // on the current page (movie-card on home, watchlist-item on watchlist).
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('input', (event) => {
            const query = event.target.value.toLowerCase().trim();
            const movieCards = document.querySelectorAll('.movie-card');
            const watchlistItems = document.querySelectorAll('.watchlist-item');

            movieCards.forEach((card) => {
                const title = card.querySelector('.movie-title').innerText.toLowerCase().trim();
                card.style.display = title.includes(query) ? '' : 'none';
            });
            watchlistItems.forEach((item) => {
                const titleEl = item.querySelector('.watchlist-title');
                if (!titleEl) return;
                const title = titleEl.innerText.toLowerCase().trim();
                item.style.display = title.includes(query) ? '' : 'none';
            });
        });
    }

    // Video playback resume, keyed per-video (not one global key for every film)
    const videoElement = document.getElementById('video');
    if (videoElement) {
        const pathParts = window.location.pathname.split('/');
        const videoId = pathParts[pathParts.length - 1] || 'unknown';
        const videoKey = `videoCurrentTime:${videoId}`;

        videoElement.addEventListener('loadedmetadata', () => {
            const savedTime = parseFloat(localStorage.getItem(videoKey));
            if (Number.isFinite(savedTime) && savedTime > 0 && savedTime < videoElement.duration) {
                videoElement.currentTime = savedTime;
            }
        });

        videoElement.addEventListener('pause', () => {
            localStorage.setItem(videoKey, String(videoElement.currentTime));
        });
    }

    // Footer year, rendered client-side only where the element exists
    const yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // Avatar fallback chain: Gravatar -> custom uploaded picture -> first-
    // letter initial. We only find out an image doesn't exist once the
    // browser actually requests it (Gravatar's d=404 mode), so this is
    // handled via `error` events rather than a server-side existence check.
    document.querySelectorAll('.js-avatar-chain').forEach((img) => {
        img.addEventListener('error', () => {
            const nextSrc = img.dataset.next;
            if (nextSrc) {
                img.dataset.next = '';
                img.src = nextSrc;
                return;
            }
            const wrapper = img.closest('.avatar-wrapper');
            const initial = document.createElement('span');
            initial.className = 'avatar avatar-initial';
            initial.style.backgroundColor = wrapper?.dataset.fallbackColor || '#666';
            initial.textContent = wrapper?.dataset.fallbackInitial || '?';
            img.replaceWith(initial);
        });
    });
});
