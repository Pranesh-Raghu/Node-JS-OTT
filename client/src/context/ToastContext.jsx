import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

// Direct port of showToast() in public/Javascript/script.js. Reuses the
// existing .toast-container/.toast/.toast-visible classes and the same
// rAF-enter / 3200ms / transitionend-remove lifecycle verbatim, so no CSS
// changes needed. Kept as an array in state instead of manual DOM
// appendChild/remove calls, which is the one thing that has to change to
// be idiomatic React.
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const showToast = useCallback((kind, message) => {
        const id = nextId.current++;
        setToasts((prev) => [...prev, { id, kind, message, visible: false }]);
        // Next frame: flip to visible so the CSS transition actually runs.
        requestAnimationFrame(() => {
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: true } : t)));
        });
        setTimeout(() => {
            setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
            // toast-visible removal starts the CSS transition; give it time
            // to finish (matches the transitionend-triggered remove()
            // in script.js) before dropping the toast from state.
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 400);
        }, 3200);
    }, []);

    return (
        <ToastContext.Provider value={showToast}>
            {children}
            <div className="toast-container" role="status" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className={`toast toast-${t.kind}${t.visible ? ' toast-visible' : ''}`}>
                        {t.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
    return ctx;
}
