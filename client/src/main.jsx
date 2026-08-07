import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <BrowserRouter>
            <SessionProvider>
                <ToastProvider>
                    <App />
                </ToastProvider>
            </SessionProvider>
        </BrowserRouter>
    </StrictMode>
);
