import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { Icon } from '../components/Icon.jsx';
import { api, ApiError } from '../lib/api.js';
import { useSession } from '../context/SessionContext.jsx';

// Ported from views/account/profile.ejs. The old ?message=/?error= flash
// pattern is replaced by local state fed directly from each mutation's
// response, same as the other account pages in this migration.
export function Profile() {
    const { session, refresh } = useSession();
    const fileInputRef = useRef(null);
    const [fileLabel, setFileLabel] = useState('Choose an image…');
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    if (!session) return null;
    const { user, email, avatarUrl, avatarInitial, avatarColor, gravatarUrl } = session;

    async function handleUpload(e) {
        e.preventDefault();
        const file = fileInputRef.current?.files?.[0];
        if (!file) {
            setError('Choose an image file first.');
            setMessage(null);
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('avatar', file);
            await api.postForm('/api/account/avatar', formData);
            await refresh();
            setMessage('Profile picture updated.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            setFileLabel('Choose an image…');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Upload failed. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleRemove() {
        setSubmitting(true);
        setError(null);
        try {
            await api.delete('/api/account/avatar');
            await refresh();
            setMessage('Profile picture removed.');
        } catch {
            setError('Could not remove your profile picture. Please try again.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Layout
            title={
                <Link to="/">
                    <h1>
                        COMICS <span className="accent-text">TV</span>
                    </h1>
                </Link>
            }
        >
            <div className="form-card">
                <h2>
                    Your <span className="accent-text">profile</span>
                </h2>
                <p className="text-muted">Upload a custom profile picture, or leave it unset to use your Gravatar or Google photo.</p>

                {error && <p className="error-message">{error}</p>}
                {message && <p className="success-message">{message}</p>}

                <div className="profile-avatar-preview">
                    <Avatar
                        username={user}
                        email={email}
                        avatarUrl={avatarUrl}
                        gravatarUrl={gravatarUrl}
                        initial={avatarInitial}
                        color={avatarColor}
                        linkToProfile={false}
                    />
                </div>

                <form onSubmit={handleUpload}>
                    <div className="file-upload">
                        <input
                            ref={fileInputRef}
                            type="file"
                            id="avatar"
                            name="avatar"
                            className="file-upload-input"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            onChange={(e) => setFileLabel(e.target.files?.[0]?.name || 'Choose an image…')}
                        />
                        <label htmlFor="avatar" className="file-upload-label">
                            <Icon name="upload" />
                            <span className="file-upload-text">{fileLabel}</span>
                        </label>
                    </div>
                    <p className="text-muted profile-hint">JPEG, PNG, WEBP, or GIF, up to 3 MB.</p>
                    <button type="submit" disabled={submitting}>
                        Upload
                    </button>
                </form>

                {avatarUrl && (
                    <div className="profile-remove-form">
                        <button type="button" className="profile-remove-btn" onClick={handleRemove} disabled={submitting}>
                            Remove current picture
                        </button>
                    </div>
                )}
            </div>
        </Layout>
    );
}
