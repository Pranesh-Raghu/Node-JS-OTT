import { Link } from 'react-router-dom';
import { useSession } from '../context/SessionContext.jsx';
import { Icon } from './Icon.jsx';
import { Avatar } from './Avatar.jsx';
import { ThemeToggle } from './ThemeToggle.jsx';

// Shared header/nav, replacing the copy-pasted markup at the top of every
// EJS view. `title` and `search` are the two axes that actually vary
// between pages (views/home.ejs's brand link vs. views/movie.ejs's
// "<h1>{movie.title}</h1>", and whether a search bar is present) -
// everything else (nav links, login state, avatar, theme toggle) is
// session-driven and identical everywhere, which is what removes the
// per-page user/email/avatarUrl/deviceCount prop drilling every
// res.render() call used to carry.
export function Header({ title, search, showHome = true }) {
    const { session } = useSession();
    const user = session?.user;
    const deviceCount = session?.deviceCount || 0;

    return (
        <header>
            <div className="header-top">
                {title}
                <nav>
                    {/* Every migrated page except Home itself had this icon
                        (views/movie.ejs, videoplayer.ejs, watchlist.ejs) -
                        Home has its own brand-as-home-link title instead
                        (see pages/Home.jsx), so it opts out via showHome. */}
                    {showHome && (
                        <Link to="/" className="nav-icon-link" title="Home" aria-label="Home">
                            <Icon name="home" />
                        </Link>
                    )}
                    <Link to="/watchlist" className="nav-icon-link" title="Watchlist" aria-label="Watchlist">
                        <Icon name="bookmark" />
                    </Link>
                    {user ? (
                        <>
                            <Link to="/account/sessions" className="nav-icon-link" title="Sessions" aria-label="Sessions">
                                <Icon name="monitor" />
                                {deviceCount > 0 && <span className="nav-badge">{deviceCount}</span>}
                            </Link>
                            <Link to="/account/webhooks" className="nav-icon-link" title="Webhooks" aria-label="Webhooks">
                                <Icon name="link" />
                            </Link>
                            {/* Logout is still a full navigation, not a SPA
                                route - it destroys the session server-side
                                and there's nothing left for React to do
                                but land on the logged-out home page. */}
                            <a href="/logout" className="nav-icon-link" title="Log out" aria-label="Log out">
                                <Icon name="log-out" />
                            </a>
                            <Avatar
                                username={user}
                                email={session.email}
                                avatarUrl={session.avatarUrl}
                                gravatarUrl={session.gravatarUrl}
                                initial={session.avatarInitial}
                                color={session.avatarColor}
                            />
                        </>
                    ) : (
                        <a href="/login" className="nav-icon-link" title="Log in" aria-label="Log in">
                            <Icon name="log-in" />
                        </a>
                    )}
                    <ThemeToggle />
                </nav>
            </div>
            {search && (
                <div className="movie-search">
                    <div id="search-bar-container">{search}</div>
                </div>
            )}
        </header>
    );
}
