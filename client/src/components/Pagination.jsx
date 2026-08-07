import { Link } from 'react-router-dom';

export function Pagination({ pagination }) {
    if (!pagination || pagination.totalPages <= 1) return null;
    return (
        <nav className="pagination" aria-label="Movie catalog pages">
            {pagination.hasPrev && (
                <Link className="pagination-link" to={`/?page=${pagination.page - 1}`}>
                    &laquo; Prev
                </Link>
            )}
            <span className="pagination-status">
                Page {pagination.page} of {pagination.totalPages}
            </span>
            {pagination.hasNext && (
                <Link className="pagination-link" to={`/?page=${pagination.page + 1}`}>
                    Next &raquo;
                </Link>
            )}
        </nav>
    );
}
