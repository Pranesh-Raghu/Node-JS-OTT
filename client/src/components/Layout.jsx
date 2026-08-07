import { useEffect } from 'react';
import { Header } from './Header.jsx';
import { Footer } from './Footer.jsx';

// Replaces the standalone <html><head>...<body> boilerplate every EJS view
// repeated. `bodyClass` covers the one page-specific body selector that
// matters for CSS (body.admin-page, see views/admin.ejs) - applied via
// classList directly since index.html owns the actual <body> tag and React
// only ever mounts into #root.
export function Layout({ title, search, bodyClass, showHome, children }) {
    useEffect(() => {
        if (!bodyClass) return;
        document.body.classList.add(bodyClass);
        return () => document.body.classList.remove(bodyClass);
    }, [bodyClass]);

    return (
        <>
            <a className="skip-link" href="#main">
                Skip to content
            </a>
            <Header title={title} search={search} showHome={showHome} />
            <main id="main">{children}</main>
            <Footer />
        </>
    );
}
