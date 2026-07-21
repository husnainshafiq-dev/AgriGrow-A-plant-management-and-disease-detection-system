import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { BookmarkProvider } from "./context/BookmarkContext";
import App from "./App.jsx";
import "./index.css";

if (import.meta.env.DEV && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
            registrations.forEach((registration) => registration.unregister());
        })
        .catch(() => {});

    if ("caches" in window) {
        caches.keys()
            .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
            .catch(() => {});
    }
}

createRoot(document.getElementById("root")).render(
    <BrowserRouter>
        <AuthProvider>
            <LanguageProvider>
                <BookmarkProvider>
                    <App />
                </BookmarkProvider>
            </LanguageProvider>
        </AuthProvider>
    </BrowserRouter>
);
