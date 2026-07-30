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

    // Custom file-upload control (account/profile): shows the chosen
    // filename instead of the browser's native "No file chosen" text. Pure
    // progressive enhancement - without JS the label's for="" attribute
    // still opens the native file picker and the form still submits fine.
    const fileInput = document.querySelector('.file-upload-input');
    const fileText = document.querySelector('.js-file-upload-text');
    if (fileInput && fileText) {
        const defaultText = fileText.textContent;
        fileInput.addEventListener('change', () => {
            fileText.textContent = fileInput.files[0]?.name || defaultText;
        });
    }

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

        const wrapper = document.createElement('div');
        wrapper.className = 'watchlist-empty-state';

        const heading = document.createElement('h2');
        const label = document.createElement('span');
        label.className = 'empty-label';
        label.textContent = 'empty';
        heading.append('Your watchlist is ', label);

        const subtitle = document.createElement('p');
        subtitle.className = 'text-muted';
        subtitle.textContent = 'Movies you add will show up here so you can pick up where you left off.';

        const browseLink = document.createElement('a');
        browseLink.className = 'watch-now-btn';
        browseLink.href = '/';
        browseLink.textContent = 'Browse movies';

        wrapper.append(heading, subtitle, browseLink);
        container.appendChild(wrapper);
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
    // on the current page.
    //
    // The watchlist page already has every item in the DOM (it's not
    // paginated), so a pure client-side filter there is correct. The home
    // page's movie grid IS paginated (24 per page) - filtering only the DOM
    // silently searched just the current page and missed the rest of the
    // catalog, so that case now calls /api/search instead and replaces the
    // grid with the real results.
    const searchBar = document.getElementById('search-bar');
    const movieGallery = document.querySelector('.movie-gallery');
    if (searchBar && movieGallery) {
        const isLoggedIn = document.body.dataset.loggedIn === 'true';
        const originalGalleryHTML = movieGallery.innerHTML;
        const paginationNav = document.querySelector('.pagination');
        let debounceHandle = null;

        const buildCard = (movie) => {
            const card = document.createElement('div');
            card.className = 'movie-card';

            const link = document.createElement('a');
            link.className = 'movie-link';
            link.href = `/movie/${encodeURIComponent(movie.id)}`;

            const img = document.createElement('img');
            img.src = movie.poster && movie.poster.startsWith('https://') ? movie.poster : `/${movie.poster || ''}`;
            img.alt = '';
            link.appendChild(img);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'movie-title';
            titleSpan.textContent = movie.title;
            link.appendChild(titleSpan);

            card.appendChild(link);

            if (isLoggedIn) {
                const button = document.createElement('button');
                button.className = 'add-to-watchlist-btn';
                button.setAttribute('data-id', movie.id);
                button.textContent = 'Add to Watchlist';
                card.appendChild(button);
            } else {
                const loginLink = document.createElement('a');
                loginLink.className = 'add-to-watchlist-btn';
                loginLink.href = `/login?redirectTo=${encodeURIComponent(`/movie/${movie.id}`)}`;
                loginLink.textContent = 'Add to Watchlist';
                card.appendChild(loginLink);
            }

            return card;
        };

        const renderResults = (movies) => {
            movieGallery.innerHTML = '';
            if (movies.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'empty-label';
                empty.textContent = 'No movies match your search.';
                movieGallery.appendChild(empty);
                return;
            }
            movies.forEach((movie) => movieGallery.appendChild(buildCard(movie)));
        };

        const runSearch = async (query) => {
            try {
                const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
                if (!res.ok) throw new Error(`search request failed: ${res.status}`);
                const data = await res.json();
                renderResults(data.movies || []);
            } catch (err) {
                console.error('Search failed:', err);
            }
        };

        searchBar.addEventListener('input', (event) => {
            const query = event.target.value.trim();
            clearTimeout(debounceHandle);

            if (!query) {
                movieGallery.innerHTML = originalGalleryHTML;
                if (paginationNav) paginationNav.style.display = '';
                return;
            }

            if (paginationNav) paginationNav.style.display = 'none';
            debounceHandle = setTimeout(() => runSearch(query), 300);
        });
    } else if (searchBar) {
        // Watchlist page: everything is already loaded, filter in place.
        searchBar.addEventListener('input', (event) => {
            const query = event.target.value.toLowerCase().trim();
            document.querySelectorAll('.watchlist-item').forEach((item) => {
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
    // letter initial (the initial is what's actually rendered server-side;
    // see views/partials/avatar.ejs). Each candidate URL is preloaded with a
    // detached Image() and only swapped into the visible DOM once it's
    // confirmed to load - this avoids ever showing the browser's native
    // broken-image icon for the common case of a user with no Gravatar
    // picture registered (Gravatar's d=404 mode means that URL is a real
    // 404 for most users).
    document.querySelectorAll('.js-avatar-chain').forEach((wrapper) => {
        const candidates = [wrapper.dataset.gravatarUrl, wrapper.dataset.avatarUrl].filter(Boolean);
        if (candidates.length === 0) return;

        const tryNext = (index) => {
            if (index >= candidates.length) return;
            const probe = new Image();
            probe.onload = () => {
                const img = document.createElement('img');
                img.className = 'avatar avatar-img';
                img.src = candidates[index];
                img.alt = wrapper.dataset.alt || '';
                const initial = wrapper.querySelector('.avatar-initial');
                if (initial) initial.replaceWith(img);
            };
            probe.onerror = () => tryNext(index + 1);
            probe.src = candidates[index];
        };
        tryNext(0);
    });
});
