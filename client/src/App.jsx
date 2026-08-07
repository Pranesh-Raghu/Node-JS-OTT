import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home.jsx';
import { Movie } from './pages/Movie.jsx';
import { VideoPlayer } from './pages/VideoPlayer.jsx';
import { Watchlist } from './pages/Watchlist.jsx';
import { Sessions } from './pages/Sessions.jsx';
import { Webhooks } from './pages/Webhooks.jsx';
import { Profile } from './pages/Profile.jsx';
import { Admin } from './pages/Admin.jsx';

// Route components are added one at a time as each page migrates (see the
// migration plan's phased sequencing) - Express keeps owning every one of
// these URLs and swaps its handler to serveSpa() only when the matching
// route below is ready, so there is never a page that's "half migrated".
export function App() {
    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/movie/:id" element={<Movie />} />
            <Route path="/video/:id" element={<VideoPlayer />} />
            <Route path="/watchlist" element={<Watchlist />} />
            <Route path="/account/sessions" element={<Sessions />} />
            <Route path="/account/webhooks" element={<Webhooks />} />
            <Route path="/account/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
        </Routes>
    );
}
