import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

const BookmarkContext = createContext(null);

export function BookmarkProvider({ children }) {
    const { isAuthenticated, authHeaders } = useAuth();
    const [bookmarks, setBookmarks] = useState({
        article: [],
        advisory: [],
        question: []
    });
    const [loading, setLoading] = useState(false);

    // Fetch bookmarks from API when authenticated
    const fetchBookmarks = useCallback(async () => {
        if (!isAuthenticated) return;
        setLoading(true);
        try {
            const res = await fetch("/api/bookmarks", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                // Assumes data.data is { article: [...], advisory: [...], question: [...] }
                const bData = data.data || data;
                setBookmarks({
                    article: bData.article || [],
                    advisory: bData.advisory || [],
                    question: bData.question || []
                });
            }
        } catch (err) {
            console.error("Failed to fetch bookmarks:", err);
        } finally {
            setLoading(false);
        }
    }, [isAuthenticated, authHeaders]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchBookmarks();
        } else {
            // Read from local storage for guests
            try {
                const saved = localStorage.getItem("agrigrow_bookmarks");
                if (saved) {
                    setBookmarks(JSON.parse(saved));
                } else {
                    setBookmarks({ article: [], advisory: [], question: [] });
                }
            } catch {
                setBookmarks({ article: [], advisory: [], question: [] });
            }
        }
    }, [isAuthenticated, fetchBookmarks]);

    const toggleBookmark = useCallback(async (type, itemId) => {
        const list = bookmarks[type] || [];
        const exists = list.includes(itemId);
        
        // Optimistic UI update
        let updatedList;
        if (exists) {
            updatedList = list.filter(id => id !== itemId);
        } else {
            updatedList = [...list, itemId];
        }
        
        const newBookmarks = {
            ...bookmarks,
            [type]: updatedList
        };
        
        setBookmarks(newBookmarks);
        
        if (isAuthenticated) {
            try {
                const method = exists ? "DELETE" : "POST";
                const url = exists ? `/api/bookmarks/${type}/${itemId}` : "/api/bookmarks";
                const body = exists ? undefined : JSON.stringify({ type, itemId });
                
                const res = await fetch(url, {
                    method,
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders()
                    },
                    credentials: "include",
                    body
                });
                
                if (!res.ok) {
                    // Revert if API failed
                    fetchBookmarks();
                }
            } catch (err) {
                console.error("Bookmark toggle failed:", err);
                fetchBookmarks();
            }
        } else {
            localStorage.setItem("agrigrow_bookmarks", JSON.stringify(newBookmarks));
        }
    }, [bookmarks, isAuthenticated, authHeaders, fetchBookmarks]);

    const isBookmarked = useCallback((type, itemId) => {
        return (bookmarks[type] || []).includes(itemId);
    }, [bookmarks]);

    const value = {
        bookmarks,
        loading,
        toggleBookmark,
        isBookmarked,
        refreshBookmarks: fetchBookmarks
    };

    return <BookmarkContext.Provider value={value}>{children}</BookmarkContext.Provider>;
}

export function useBookmarks() {
    const ctx = useContext(BookmarkContext);
    if (!ctx) throw new Error("useBookmarks must be used within BookmarkProvider");
    return ctx;
}

export default BookmarkContext;
