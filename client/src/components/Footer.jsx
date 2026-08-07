// Replaces the #current-year + script.js DOM write with a plain
// expression - one less thing script.js has to do on every page.
export function Footer() {
    return (
        <footer>
            <p>
                &copy; {new Date().getFullYear()} COMICS <span className="accent-text">TV</span>
            </p>
        </footer>
    );
}
