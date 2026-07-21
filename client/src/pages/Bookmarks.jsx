import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useBookmarks } from "../context/BookmarkContext";
import "./Bookmarks.css";

export default function Bookmarks() {
    const { authHeaders } = useAuth();
    const { t } = useLanguage();
    const { toggleBookmark } = useBookmarks();

    const [activeTab, setActiveTab] = useState("article");
    const [loading, setLoading] = useState(true);
    const [bookmarkedItems, setBookmarkedItems] = useState({
        article: [],
        advisory: [],
        question: []
    });

    const fetchBookmarks = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/bookmarks", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setBookmarkedItems({
                    article: data.data?.article || [],
                    advisory: data.data?.advisory || [],
                    question: data.data?.question || []
                });
            }
        } catch (err) {
            console.error("Failed to fetch populated bookmarks:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchBookmarks();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRemove = async (type, id) => {
        try {
            await toggleBookmark(type, id);
            // Optimistically update local view
            setBookmarkedItems(prev => ({
                ...prev,
                [type]: prev[type].filter(item => item._id !== id)
            }));
        } catch (err) {
            console.error("Failed to remove bookmark:", err);
        }
    };

    const activeList = bookmarkedItems[activeTab] || [];

    return (
        <div className="bookmarks-page">
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
            </div>

            <div className="bookmarks-content container">
                <div className="bookmarks-header">
                    <h2>{t("nav.bookmarks")}</h2>
                    <p className="text-dim">Your saved crop advisory guidelines, discussions, and articles</p>
                </div>

                {/* Tab Switcher */}
                <div className="bookmarks-tabs">
                    <button
                        onClick={() => setActiveTab("article")}
                        className={`tab-link ${activeTab === "article" ? "active" : ""}`}
                    >
                        📰 Articles
                    </button>
                    <button
                        onClick={() => setActiveTab("advisory")}
                        className={`tab-link ${activeTab === "advisory" ? "active" : ""}`}
                    >
                        🤖 AI Advisories
                    </button>
                    <button
                        onClick={() => setActiveTab("question")}
                        className={`tab-link ${activeTab === "question" ? "active" : ""}`}
                    >
                        ❓ Expert Questions
                    </button>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Retrieving bookmarks...</p>
                    </div>
                ) : activeList.length === 0 ? (
                    <div className="empty-state glass-panel">
                        <div className="empty-icon">🔖</div>
                        <h3>No bookmarks saved</h3>
                        <p>Items you bookmark across AgriGrow will appear organized in this dashboard.</p>
                    </div>
                ) : (
                    <div className="bookmarks-grid">
                        {activeList.map(item => (
                            <div key={item._id} className="bookmark-item-card glass-panel">
                                <button
                                    onClick={() => handleRemove(activeTab, item._id)}
                                    className="remove-bookmark-btn"
                                    title="Unbookmark"
                                >
                                    ×
                                </button>
                                
                                {activeTab === "article" && (
                                    <div className="card-inner">
                                        <span className="item-badge">{item.category}</span>
                                        <h4 className="item-title">{item.title}</h4>
                                        <p className="item-desc">{item.excerpt}</p>
                                        <div className="item-footer">
                                            <span>By: {item.authorName}</span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "advisory" && (
                                    <div className="card-inner">
                                        <span className="item-badge" style={{ background: "rgba(16, 185, 129, 0.1)", color: "#10b981" }}>
                                            {item.category}
                                        </span>
                                        <h4 className="item-title" style={{ fontSize: "14px", color: "#a7f3d0" }}>
                                            Query: "{item.query}"
                                        </h4>
                                        <p className="item-desc advisory-preview-text">{item.response}</p>
                                        <div className="item-footer">
                                            <span>Urgency: <strong>{item.actionUrgency}</strong></span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === "question" && (
                                    <div className="card-inner">
                                        <span className="item-badge" style={{ background: "rgba(14, 165, 233, 0.1)", color: "#0ea5e9" }}>
                                            {item.category}
                                        </span>
                                        <h4 className="item-title">{item.title}</h4>
                                        <p className="item-desc">{item.body?.substring(0, 120)}...</p>
                                        <div className="item-footer">
                                            <span>Status: <strong>{item.status}</strong></span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
