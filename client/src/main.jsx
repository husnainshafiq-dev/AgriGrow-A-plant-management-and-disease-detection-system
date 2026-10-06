import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import { BookmarkProvider } from "./context/BookmarkContext";
import App from "./App.jsx";
import "./index.css";
// Resolve backend API URL from VITE_API_URL or localStorage or live Render production backend
export const getApiBaseUrl = () => {
    let raw = (import.meta.env.VITE_API_URL || "").trim();
    if (!raw && typeof window !== "undefined") {
        raw = (localStorage.getItem("agrigrow_api_url") || "").trim();
    }
    if (!raw && typeof window !== "undefined") {
        const host = window.location.hostname;
        if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
            return "https://agrigrow-a-plant-management-and-disease.onrender.com";
        }
    }
    if (!raw) return "";

    // Automatically strip markdown link format [url](url) if pasted accidentally
    const urlMatch = raw.match(/https?:\/\/[^\s\)\'\"\]]+/i);
    if (urlMatch) {
        return urlMatch[0].replace(/\/$/, "");
    }
    return raw.replace(/\/$/, "");
};

// Helper: resolve full URL for user avatars (handles relative /uploads, data URIs, and external URLs)
export const getAvatarUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("data:") || url.startsWith("http://") || url.startsWith("https://")) {
        return url;
    }
    const base = getApiBaseUrl();
    const cleanUrl = url.startsWith("/") ? url : `/${url}`;
    return base ? `${base}${cleanUrl}` : cleanUrl;
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

const rootEl = document.getElementById("root");
if (rootEl) {
    createRoot(rootEl).render(
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
}
