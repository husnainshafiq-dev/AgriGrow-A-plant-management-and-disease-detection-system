import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { BookmarkProvider } from "./context/BookmarkContext";
import App from "./App.jsx";
import "./index.css";
// Resolve backend API URL from VITE_API_URL or localStorage
export const getApiBaseUrl = () => {
    const envUrl = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
    if (envUrl) return envUrl;
    if (typeof window !== "undefined") {
        const stored = (localStorage.getItem("agrigrow_api_url") || "").trim().replace(/\/$/, "");
        if (stored) return stored;
    }
    return "";
};

if (typeof window !== "undefined" && window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
        const apiBase = getApiBaseUrl();
        if (apiBase) {
            if (typeof input === "string") {
                if (input.startsWith("/api") || input.startsWith("/uploads")) {
                    return originalFetch(`${apiBase}${input}`, init);
                }
            } else if (input && typeof input.url === "string") {
                if (input.url.startsWith("/api") || input.url.startsWith("/uploads")) {
                    return originalFetch(new Request(`${apiBase}${input.url}`, input), init);
                }
            }
        }
        return originalFetch(input, init);
    };
}

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
