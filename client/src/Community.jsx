import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import "./Community.css";

const BLOG_CATEGORIES = [
    ["disease-treatment", "Disease Treatment", "🩺"],
    ["crop-guides", "Crop Guides", "🌾"],
    ["soil-care", "Soil Care", "🌱"],
    ["weather-tips", "Weather Tips", "⛅"],
    ["success-stories", "Success Stories", "🏆"],
    ["general", "General Farming", "🚜"],
];

const emptyPost = {
    title: "",
    authorName: "",
    submitterEmail: "",
    category: "general",
    tags: "",
    excerpt: "",
    coverImage: "",
    content: "",
};

const emptyThread = {
    title: "",
    authorName: "",
    authorEmail: "",
    categorySlug: "general-farming",
    body: "",
};

function Community({ onBack }) {
    const { user, isAuthenticated } = useAuth();
    const navigate = useNavigate();

    // Active tab: 'blog' | 'forum' | 'submit' | 'notifications'
    const [tab, setTab] = useState("blog");
    const [notice, setNotice] = useState(null); // { type: 'success' | 'error', message: string }
    const [loading, setLoading] = useState(false);

    // Blog states
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [postForm, setPostForm] = useState(emptyPost);
    const [blogCategory, setBlogCategory] = useState("all");
    const [blogSearch, setBlogSearch] = useState("");
    const [commentText, setCommentText] = useState("");
    const [commentAuthor, setCommentAuthor] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);

    // Forum states
    const [categories, setCategories] = useState([]);
    const [threads, setThreads] = useState([]);
    const [selectedThread, setSelectedThread] = useState(null);
    const [replies, setReplies] = useState([]);
    const [threadForm, setThreadForm] = useState(emptyThread);
    const [replyBody, setReplyBody] = useState("");
    const [replyAuthor, setReplyAuthor] = useState("");
    const [submittingReply, setSubmittingReply] = useState(false);
    const [forumCategory, setForumCategory] = useState("all");
    const [forumFilter, setForumFilter] = useState("all"); // 'all' | 'solved' | 'open'
    const [forumSearch, setForumSearch] = useState("");

    // Submit type selector inside submit tab
    const [submitType, setSubmitType] = useState("guide"); // 'guide' | 'thread'

    // Notifications state
    const [notificationEmail, setNotificationEmail] = useState("");
    const [notifications, setNotifications] = useState([]);
    const [notifLoading, setNotifLoading] = useState(false);

    // Autofill user details when authenticated
    useEffect(() => {
        if (isAuthenticated && user) {
            setPostForm(prev => ({
                ...prev,
                authorName: prev.authorName || user.name || "",
                submitterEmail: prev.submitterEmail || user.email || ""
            }));
            setThreadForm(prev => ({
                ...prev,
                authorName: prev.authorName || user.name || "",
                authorEmail: prev.authorEmail || user.email || ""
            }));
            setNotificationEmail(prev => prev || user.email || "");
            setCommentAuthor(prev => prev || user.name || "");
            setReplyAuthor(prev => prev || user.name || "");
        }
    }, [isAuthenticated, user]);

    const flash = (message, type = "success") => {
        setNotice({ type, message });
        setTimeout(() => setNotice(null), 4000);
    };

    const api = async (url, options = {}) => {
        const res = await fetch(url, {
            credentials: "include",
            ...options,
            headers: {
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
            throw new Error(data.error || data.message || "Request failed");
        }
        return data.data || data;
    };

    const loadBlog = async () => {
        try {
            const data = await api("/api/blog/posts");
            setPosts(data.posts || []);
        } catch (err) {
            console.error("Failed to load blog posts:", err);
        }
    };

    const loadForum = async () => {
        try {
            const [catData, threadData] = await Promise.all([
                api("/api/forum/categories"),
                api("/api/forum/threads"),
            ]);
            setCategories(catData.categories || []);
            setThreads(threadData.threads || []);
            if ((catData.categories || []).length && !threadForm.categorySlug) {
                setThreadForm(prev => ({ ...prev, categorySlug: catData.categories[0].slug }));
            }
        } catch (err) {
            console.error("Failed to load forum:", err);
        }
    };

    useEffect(() => {
        loadBlog();
        loadForum();
    }, []);

    // Filtered Blog Posts
    const filteredPosts = useMemo(() => {
        return posts.filter(post => {
            const matchesCat = blogCategory === "all" || post.category === blogCategory;
            const matchesSearch = !blogSearch.trim() ||
                post.title.toLowerCase().includes(blogSearch.toLowerCase()) ||
                (post.excerpt && post.excerpt.toLowerCase().includes(blogSearch.toLowerCase())) ||
                (post.tags && post.tags.some(t => t.toLowerCase().includes(blogSearch.toLowerCase())));
            return matchesCat && matchesSearch;
        });
    }, [posts, blogCategory, blogSearch]);

    // Filtered Forum Threads
    const filteredThreads = useMemo(() => {
        return threads.filter(thread => {
            const matchesCat = forumCategory === "all" ||
                thread.category?.slug === forumCategory ||
                thread.categorySlug === forumCategory;
            const matchesStatus = forumFilter === "all" ||
                (forumFilter === "solved" && thread.isSolved) ||
                (forumFilter === "open" && !thread.isSolved);
            const matchesSearch = !forumSearch.trim() ||
                thread.title.toLowerCase().includes(forumSearch.toLowerCase()) ||
                thread.body.toLowerCase().includes(forumSearch.toLowerCase());
            return matchesCat && matchesStatus && matchesSearch;
        });
    }, [threads, forumCategory, forumFilter, forumSearch]);

    // Statistics
    const stats = useMemo(() => {
        const solvedCount = threads.filter(t => t.isSolved).length;
        const solvedPct = threads.length > 0 ? Math.round((solvedCount / threads.length) * 100) : 85;
        return {
            guideCount: posts.length,
            threadCount: threads.length,
            solvedPct,
            memberCount: "3,500+"
        };
    }, [posts, threads]);

    // Handlers for Blog
    const openPost = async (slug) => {
        const cached = posts.find(p => p.slug === slug);
        if (cached) {
            setSelectedPost(cached);
        }
        try {
            const data = await api(`/api/blog/posts/${slug}`);
            setSelectedPost(data.post);
            setPosts(prev => prev.map(p => (p.slug === slug || p._id === data.post._id) ? { ...p, ...data.post } : p));
        } catch (err) {
            flash(err.message, "error");
        }
    };

    const submitBlogPost = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            await api("/api/blog/posts", {
                method: "POST",
                body: JSON.stringify(postForm),
            });
            setPostForm(emptyPost);
            flash("Field Guide submitted successfully! It will appear once approved by an agronomist.");
            setTab("blog");
            loadBlog();
        } catch (err) {
            flash(err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleAddComment = async (e) => {
        e.preventDefault();
        if (!isAuthenticated) {
            flash("Please log in to post a comment", "error");
            navigate("/login?redirect=" + encodeURIComponent("/community"));
            return;
        }
        if (!selectedPost || !commentText.trim()) return;
        setSubmittingComment(true);
        const text = commentText.trim();
        const author = commentAuthor.trim() || user?.name || "Community Farmer";

        // Optimistic local comment for immediate display
        const tempId = "temp-" + Date.now();
        const optimisticComment = {
            _id: tempId,
            content: text,
            authorName: author,
            createdAt: new Date().toISOString()
        };

        // 1. Instantly display in the reader modal
        setSelectedPost(prev => ({
            ...prev,
            comments: [...(prev.comments || []), optimisticComment]
        }));

        // 2. Instantly increment the comments badge on the card in the main list
        setPosts(prev => prev.map(p => {
            if (p.slug === selectedPost.slug || p._id === selectedPost._id) {
                return {
                    ...p,
                    comments: [...(p.comments || []), optimisticComment]
                };
            }
            return p;
        }));

        setCommentText("");

        try {
            const res = await api(`/api/blog/posts/${selectedPost.slug}/comments`, {
                method: "POST",
                body: JSON.stringify({
                    content: text,
                    authorName: author,
                    authorEmail: user?.email || ""
                }),
            });
            flash("Comment posted successfully!");

            const finalComments = res.comments || (res.comment ? [...(selectedPost.comments || []).filter(c => c._id !== tempId), res.comment] : null);

            if (finalComments) {
                setSelectedPost(prev => ({
                    ...prev,
                    comments: finalComments
                }));
                setPosts(prev => prev.map(p => {
                    if (p.slug === selectedPost.slug || p._id === selectedPost._id) {
                        return {
                            ...p,
                            comments: finalComments
                        };
                    }
                    return p;
                }));
            }
        } catch (err) {
            // Revert optimistic update on failure
            setSelectedPost(prev => ({
                ...prev,
                comments: (prev.comments || []).filter(c => c._id !== tempId)
            }));
            setPosts(prev => prev.map(p => {
                if (p.slug === selectedPost.slug || p._id === selectedPost._id) {
                    return {
                        ...p,
                        comments: (p.comments || []).filter(c => c._id !== tempId)
                    };
                }
                return p;
            }));
            flash(err.message, "error");
        } finally {
            setSubmittingComment(false);
        }
    };

    // Handlers for Forum
    const openThread = async (slug) => {
        const cached = threads.find(t => t.slug === slug);
        if (cached) {
            setSelectedThread(cached);
        }
        try {
            const data = await api(`/api/forum/threads/${slug}`);
            setSelectedThread(data.thread);
            setReplies(data.replies || []);
            setThreads(prev => prev.map(t => (t.slug === slug || t._id === data.thread._id) ? { ...t, ...data.thread } : t));
        } catch (err) {
            flash(err.message, "error");
        }
    };

    const submitThread = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            await api("/api/forum/threads", {
                method: "POST",
                body: JSON.stringify(threadForm),
            });
            setThreadForm({ ...emptyThread, categorySlug: categories[0]?.slug || "general-farming" });
            flash("Discussion thread submitted successfully!");
            setTab("forum");
            loadForum();
        } catch (err) {
            flash(err.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const submitReply = async (event) => {
        event.preventDefault();
        if (!selectedThread || !replyBody.trim()) return;
        setSubmittingReply(true);
        const text = replyBody.trim();
        const author = replyAuthor.trim() || user?.name || "Community Member";

        const tempId = "temp-reply-" + Date.now();
        const optimisticReply = {
            _id: tempId,
            body: text,
            authorName: author,
            createdAt: new Date().toISOString(),
            isSolution: false,
            guestUpvoteCount: 0
        };

        // 1. Instantly display in replies list
        setReplies(prev => [...prev, optimisticReply]);
        setSelectedThread(prev => ({ ...prev, replyCount: (prev.replyCount || 0) + 1 }));

        // 2. Instantly increment reply counter on thread card in forum list
        setThreads(prev => prev.map(t => {
            if (t.slug === selectedThread.slug || t._id === selectedThread._id) {
                return { ...t, replyCount: (t.replyCount || 0) + 1 };
            }
            return t;
        }));

        setReplyBody("");

        try {
            const res = await api(`/api/forum/threads/${selectedThread.slug}/replies`, {
                method: "POST",
                body: JSON.stringify({
                    body: text,
                    authorName: author,
                    authorEmail: user?.email || ""
                }),
            });
            flash("Reply added to discussion!");
            if (res.reply) {
                setReplies(prev => prev.map(r => r._id === tempId ? res.reply : r));
            }
        } catch (err) {
            setReplies(prev => prev.filter(r => r._id !== tempId));
            setSelectedThread(prev => ({ ...prev, replyCount: Math.max((prev.replyCount || 1) - 1, 0) }));
            setThreads(prev => prev.map(t => {
                if (t.slug === selectedThread.slug || t._id === selectedThread._id) {
                    return { ...t, replyCount: Math.max((t.replyCount || 1) - 1, 0) };
                }
                return t;
            }));
            flash(err.message, "error");
        } finally {
            setSubmittingReply(false);
        }
    };

    const handleUpvoteThread = async (threadId) => {
        try {
            await api(`/api/forum/threads/${threadId}/upvote`, { method: "POST" });
            setThreads(prev => prev.map(t => {
                if (t._id === threadId) {
                    return { ...t, guestUpvoteCount: (t.guestUpvoteCount || 0) + 1 };
                }
                return t;
            }));
            if (selectedThread && selectedThread._id === threadId) {
                setSelectedThread(prev => ({ ...prev, guestUpvoteCount: (prev.guestUpvoteCount || 0) + 1 }));
            }
            flash("Upvoted discussion!");
        } catch (err) {
            flash(err.message, "error");
        }
    };

    const reportItem = async (targetType, targetId) => {
        const reason = window.prompt("Reason for reporting this content (e.g. spam, misinformation):", "Inappropriate content");
        if (!reason) return;
        try {
            await api("/api/forum/reports", {
                method: "POST",
                body: JSON.stringify({ targetType, targetId, reason: "other", details: reason }),
            });
            flash("Report submitted to AgriGrow moderators for review.");
        } catch (err) {
            flash(err.message, "error");
        }
    };

    const loadNotifications = async () => {
        if (!notificationEmail.trim()) {
            flash("Please enter the email address used for submissions.", "error");
            return;
        }
        setNotifLoading(true);
        try {
            const data = await api(`/api/blog/notifications?email=${encodeURIComponent(notificationEmail.trim())}`);
            setNotifications(data.notifications || []);
        } catch (err) {
            flash(err.message, "error");
        } finally {
            setNotifLoading(false);
        }
    };

    // If user is not authenticated, show login required gate
    if (!isAuthenticated) {
        return (
            <div className="community-page">
                <header className="community-header-hero">
                    <div className="community-container">
                        <div className="community-hero-content">
                            <h1>🌾 AgriGrow Community Hub</h1>
                            <p className="community-tagline">
                                Field Guides, Agronomist Advice & Discussion Forum
                            </p>
                        </div>
                    </div>
                </header>
                <div className="community-container auth-gate-container">
                    <div className="auth-gate-card glass-panel">
                        <div className="auth-gate-icon">👥</div>
                        <h2>AgriGrow Community Hub</h2>
                        <p className="auth-gate-desc">
                            Field guides, discussions, agronomist advice, and post commenting are features for registered AgriGrow members. Please log in to view discussions and share with fellow farmers.
                        </p>
                        <div className="auth-gate-actions">
                            <button
                                type="button"
                                onClick={() => navigate("/login?redirect=" + encodeURIComponent("/community"))}
                                className="btn-primary auth-gate-btn"
                            >
                                🔐 Log In to View Community
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate("/register?redirect=" + encodeURIComponent("/community"))}
                                className="btn-secondary auth-gate-btn"
                            >
                                🌱 Create Free Account
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="community-page">
            {/* Ambient Lighting Mesh */}
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="community-container">
                {/* Hero Header */}
                <header className="community-hero">
                    <div className="hero-top-row">
                        {onBack && (
                            <button className="back-btn" onClick={onBack} title="Return to Home">
                                ← Back
                            </button>
                        )}
                        <span className="community-live-badge">
                            <span className="pulse-dot"></span> Active Farmer Network
                        </span>
                    </div>

                    <div className="hero-content">
                        <h1>AgriGrow Community Hub</h1>
                        <p className="hero-subtitle">
                            Connect with progressive growers, certified agronomists, and researchers across Pakistan.
                            Access verified crop protection guides, troubleshoot field problems, and share practical wisdom.
                        </p>

                        {/* Community Live Stats Bar */}
                        <div className="community-stats-bar">
                            <div className="stat-card">
                                <span className="stat-icon">📚</span>
                                <div className="stat-info">
                                    <span className="stat-val">{stats.guideCount}</span>
                                    <span className="stat-lbl">Field Guides</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <span className="stat-icon">💬</span>
                                <div className="stat-info">
                                    <span className="stat-val">{stats.threadCount}</span>
                                    <span className="stat-lbl">Discussions</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <span className="stat-icon">✅</span>
                                <div className="stat-info">
                                    <span className="stat-val">{stats.solvedPct}%</span>
                                    <span className="stat-lbl">Questions Solved</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <span className="stat-icon">👥</span>
                                <div className="stat-info">
                                    <span className="stat-val">{stats.memberCount}</span>
                                    <span className="stat-lbl">Growers & Experts</span>
                                </div>
                            </div>
                        </div>

                        {/* Fast Action CTA Buttons */}
                        <div className="hero-actions">
                            <button
                                className="cta-btn primary"
                                onClick={() => { setTab("forum"); setSubmitType("thread"); }}
                            >
                                💬 Join Discussions
                            </button>
                            <button
                                className="cta-btn secondary"
                                onClick={() => { setTab("submit"); setSubmitType("guide"); }}
                            >
                                ✍️ Publish a Guide
                            </button>
                        </div>
                    </div>
                </header>

                {/* Main Navigation Tabs */}
                <nav className="community-nav-tabs">
                    <button
                        className={`tab-btn ${tab === "blog" ? "active" : ""}`}
                        onClick={() => { setTab("blog"); setSelectedPost(null); }}
                    >
                        <span className="tab-icon">📖</span>
                        <span>Field Guides & Articles</span>
                        <span className="tab-count">{posts.length}</span>
                    </button>
                    <button
                        className={`tab-btn ${tab === "forum" ? "active" : ""}`}
                        onClick={() => { setTab("forum"); setSelectedThread(null); }}
                    >
                        <span className="tab-icon">💬</span>
                        <span>Discussion Forum</span>
                        <span className="tab-count">{threads.length}</span>
                    </button>
                    <button
                        className={`tab-btn ${tab === "submit" ? "active" : ""}`}
                        onClick={() => setTab("submit")}
                    >
                        <span className="tab-icon">✍️</span>
                        <span>Share Knowledge</span>
                    </button>
                    <button
                        className={`tab-btn ${tab === "notifications" ? "active" : ""}`}
                        onClick={() => setTab("notifications")}
                    >
                        <span className="tab-icon">🔔</span>
                        <span>Status & Alerts</span>
                        {notifications.length > 0 && <span className="tab-count notif">{notifications.length}</span>}
                    </button>
                </nav>

                {/* Feedback Toast Notification */}
                {notice && (
                    <div className={`community-alert-banner ${notice.type === "success" ? "alert-success" : "alert-error"}`}>
                        <span>{notice.type === "success" ? "✓" : "⚠️"}</span>
                        <span>{notice.message}</span>
                    </div>
                )}

                {/* ============================================================== */}
                {/* 1. BLOG TAB: Educational Guides & Practical Advice */}
                {/* ============================================================== */}
                {tab === "blog" && (
                    <div className="tab-view-content">
                        {/* Search & Category Filter Bar */}
                        <div className="filter-controls-bar glass-panel">
                            <div className="search-box">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search by topic, disease, crop, or keywords..."
                                    value={blogSearch}
                                    onChange={(e) => setBlogSearch(e.target.value)}
                                />
                                {blogSearch && (
                                    <button className="clear-search-btn" onClick={() => setBlogSearch("")}>×</button>
                                )}
                            </div>

                            <div className="category-chips-list">
                                <button
                                    className={`category-chip ${blogCategory === "all" ? "active" : ""}`}
                                    onClick={() => setBlogCategory("all")}
                                >
                                    🌟 All Guides
                                </button>
                                {BLOG_CATEGORIES.map(([id, label, icon]) => (
                                    <button
                                        key={id}
                                        className={`category-chip ${blogCategory === id ? "active" : ""}`}
                                        onClick={() => setBlogCategory(id)}
                                    >
                                        <span>{icon}</span> {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Blog Posts Grid */}
                        {filteredPosts.length === 0 ? (
                            <div className="empty-state-panel glass-panel">
                                <span className="empty-emoji">🌾</span>
                                <h3>No matching guides found</h3>
                                <p>Try clearing your search terms or select another category.</p>
                                <button className="btn-reset" onClick={() => { setBlogCategory("all"); setBlogSearch(""); }}>
                                    Show All Guides
                                </button>
                            </div>
                        ) : (
                            <div className="guides-cards-grid">
                                {filteredPosts.map(post => {
                                    const catInfo = BLOG_CATEGORIES.find(([id]) => id === post.category) || ["general", post.category, "🌾"];
                                    return (
                                        <article
                                            key={post._id}
                                            className="guide-card glass-panel"
                                            onClick={() => openPost(post.slug)}
                                        >
                                            <div className="guide-cover-wrapper">
                                                {post.coverImage ? (
                                                    <img src={post.coverImage} alt={post.title} className="guide-cover-img" />
                                                ) : (
                                                    <div className="guide-cover-fallback">
                                                        <span className="fallback-icon">{catInfo[2]}</span>
                                                    </div>
                                                )}
                                                <span className="guide-category-tag">
                                                    {catInfo[2]} {catInfo[1]}
                                                </span>
                                            </div>

                                            <div className="guide-card-body">
                                                <h3 className="guide-title">{post.title}</h3>
                                                <p className="guide-excerpt">
                                                    {post.excerpt || post.content.slice(0, 140) + "..."}
                                                </p>

                                                {/* Tags */}
                                                {post.tags && post.tags.length > 0 && (
                                                    <div className="guide-tags">
                                                        {post.tags.slice(0, 3).map((tag, idx) => (
                                                            <span key={idx} className="tag-pill">#{tag}</span>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="guide-meta-footer">
                                                    <div className="author-details">
                                                        <div className="avatar-circle">
                                                            {(post.authorName || "AgriGrow")[0].toUpperCase()}
                                                        </div>
                                                        <div className="author-text">
                                                            <span className="author-name">{post.authorName}</span>
                                                            <span className="post-date">
                                                                {new Date(post.publishedAt || post.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="guide-stats">
                                                        <span title="Views">👁️ {post.viewCount || 0}</span>
                                                        <span title="Comments">💬 {(post.comments || []).length}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ============================================================== */}
                {/* 2. FORUM TAB: Interactive Discussions & Q&A */}
                {/* ============================================================== */}
                {tab === "forum" && (
                    <div className="tab-view-content">
                        {/* Forum Controls Bar */}
                        <div className="filter-controls-bar glass-panel">
                            <div className="search-box">
                                <span className="search-icon">🔍</span>
                                <input
                                    type="text"
                                    placeholder="Search discussions by topic, symptom, or question..."
                                    value={forumSearch}
                                    onChange={(e) => setForumSearch(e.target.value)}
                                />
                                {forumSearch && (
                                    <button className="clear-search-btn" onClick={() => setForumSearch("")}>×</button>
                                )}
                            </div>

                            <div className="forum-dropdown-filters">
                                <select
                                    value={forumCategory}
                                    onChange={(e) => setForumCategory(e.target.value)}
                                    className="forum-select"
                                >
                                    <option value="all">📂 All Categories</option>
                                    {categories.map(c => (
                                        <option key={c._id} value={c.slug}>{c.name}</option>
                                    ))}
                                </select>

                                <div className="status-filter-pills">
                                    <button
                                        className={`status-pill ${forumFilter === "all" ? "active" : ""}`}
                                        onClick={() => setForumFilter("all")}
                                    >
                                        All ({threads.length})
                                    </button>
                                    <button
                                        className={`status-pill ${forumFilter === "solved" ? "active" : ""}`}
                                        onClick={() => setForumFilter("solved")}
                                    >
                                        ✅ Solved
                                    </button>
                                    <button
                                        className={`status-pill ${forumFilter === "open" ? "active" : ""}`}
                                        onClick={() => setForumFilter("open")}
                                    >
                                        💬 Open
                                    </button>
                                </div>

                                <button
                                    className="btn-new-thread"
                                    onClick={() => { setTab("submit"); setSubmitType("thread"); }}
                                >
                                    + Start Discussion
                                </button>
                            </div>
                        </div>

                        {/* Forum Threads List */}
                        {filteredThreads.length === 0 ? (
                            <div className="empty-state-panel glass-panel">
                                <span className="empty-emoji">💬</span>
                                <h3>No discussions found</h3>
                                <p>Be the first to start a conversation in this category!</p>
                                <button
                                    className="cta-btn primary"
                                    onClick={() => { setTab("submit"); setSubmitType("thread"); }}
                                    style={{ marginTop: "12px" }}
                                >
                                    + Start a Discussion
                                </button>
                            </div>
                        ) : (
                            <div className="threads-list">
                                {filteredThreads.map(thread => {
                                    const catColor = thread.category?.color || "#10b981";
                                    const catName = thread.category?.name || "General";
                                    return (
                                        <article
                                            key={thread._id}
                                            className="thread-card glass-panel"
                                            onClick={() => openThread(thread.slug)}
                                        >
                                            <div className="thread-left-accent" style={{ backgroundColor: catColor }}></div>
                                            <div className="thread-content-wrap">
                                                <div className="thread-header-row">
                                                    <span className="thread-cat-badge" style={{ color: catColor, borderColor: catColor + "44", background: catColor + "14" }}>
                                                        {catName}
                                                    </span>
                                                    {thread.isSolved ? (
                                                        <span className="solved-badge">✓ Solved</span>
                                                    ) : (
                                                        <span className="open-badge">💬 Open Discussion</span>
                                                    )}
                                                </div>

                                                <h3 className="thread-title">{thread.title}</h3>
                                                <p className="thread-snippet">{thread.body.slice(0, 160)}...</p>

                                                <div className="thread-footer-row">
                                                    <div className="thread-author-meta">
                                                        <span className="author-avatar-small">{(thread.authorName || "F")[0].toUpperCase()}</span>
                                                        <span>{thread.authorName}</span>
                                                        <span className="bullet-sep">•</span>
                                                        <span>{new Date(thread.lastActivityAt || thread.createdAt).toLocaleDateString()}</span>
                                                    </div>

                                                    <div className="thread-engagement-stats">
                                                        <button
                                                            type="button"
                                                            className="upvote-pill"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleUpvoteThread(thread._id);
                                                            }}
                                                            title="Upvote this discussion"
                                                        >
                                                            ▲ {thread.guestUpvoteCount || thread.upvotes?.length || 0}
                                                        </button>
                                                        <span className="reply-count-pill">
                                                            💬 {thread.replyCount || 0} {thread.replyCount === 1 ? "reply" : "replies"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ============================================================== */}
                {/* 3. SUBMIT TAB: Share a Guide or Start a Discussion */}
                {/* ============================================================== */}
                {tab === "submit" && (
                    <div className="tab-view-content">
                        <div className="submit-container glass-panel">
                            {/* Type Switcher */}
                            <div className="submit-type-selector">
                                <button
                                    type="button"
                                    className={`type-btn ${submitType === "guide" ? "active" : ""}`}
                                    onClick={() => setSubmitType("guide")}
                                >
                                    📖 Submit a Farmer Guide
                                </button>
                                <button
                                    type="button"
                                    className={`type-btn ${submitType === "thread" ? "active" : ""}`}
                                    onClick={() => setSubmitType("thread")}
                                >
                                    💬 Start a Forum Discussion
                                </button>
                            </div>

                            {submitType === "guide" ? (
                                <form onSubmit={submitBlogPost} className="modern-form">
                                    <div className="form-info-notice">
                                        💡 <strong>Grower's Tip:</strong> Articles submitted here are reviewed by agronomists before publication to guarantee scientific accuracy and safe practices for our community.
                                    </div>

                                    <div className="form-group">
                                        <label>Guide Title *</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Managing Whitefly in Cotton: Integrated Pest Management Schedule"
                                            value={postForm.title}
                                            onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Author / Contributor Name *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Chaudhry Aslam or Dr. Tariq"
                                                value={postForm.authorName}
                                                onChange={(e) => setPostForm({ ...postForm, authorName: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Email Address *</label>
                                            <input
                                                type="email"
                                                required
                                                placeholder="For editorial notification updates"
                                                value={postForm.submitterEmail}
                                                onChange={(e) => setPostForm({ ...postForm, submitterEmail: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Category *</label>
                                            <select
                                                value={postForm.category}
                                                onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}
                                            >
                                                {BLOG_CATEGORIES.map(([val, label, icon]) => (
                                                    <option key={val} value={val}>{icon} {label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label>Tags (Comma-separated)</label>
                                            <input
                                                type="text"
                                                placeholder="e.g. cotton, whitefly, punjab, spray"
                                                value={postForm.tags}
                                                onChange={(e) => setPostForm({ ...postForm, tags: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Cover Image URL (Optional)</label>
                                        <input
                                            type="url"
                                            placeholder="https://example.com/field-photo.jpg"
                                            value={postForm.coverImage}
                                            onChange={(e) => setPostForm({ ...postForm, coverImage: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Summary / Excerpt</label>
                                        <textarea
                                            rows="2"
                                            placeholder="Short 1-2 sentence overview of your recommendations..."
                                            value={postForm.excerpt}
                                            onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Detailed Content *</label>
                                        <textarea
                                            rows="8"
                                            required
                                            placeholder="Write your detailed agronomy guide, symptoms to look for, recommended treatments, dosage per acre, and precautions..."
                                            value={postForm.content}
                                            onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-actions-row">
                                        <button type="submit" disabled={loading} className="btn-submit-action">
                                            {loading ? "Submitting..." : "🚀 Submit for Agronomist Review"}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={submitThread} className="modern-form">
                                    <div className="form-info-notice">
                                        💡 <strong>Community Forum:</strong> Ask any question regarding crop pests, fertilizers, tubewells, or mandi rates. Fellow farmers and local agronomists will jump in to help!
                                    </div>

                                    <div className="form-group">
                                        <label>Discussion Question or Topic *</label>
                                        <input
                                            type="text"
                                            required
                                            placeholder="e.g. Irregular brown blotches appearing on potato leaves after frost"
                                            value={threadForm.title}
                                            onChange={(e) => setThreadForm({ ...threadForm, title: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-group">
                                            <label>Your Name *</label>
                                            <input
                                                type="text"
                                                required
                                                placeholder="e.g. Asim (Multan)"
                                                value={threadForm.authorName}
                                                onChange={(e) => setThreadForm({ ...threadForm, authorName: e.target.value })}
                                            />
                                        </div>
                                        <div className="form-group">
                                            <label>Forum Category *</label>
                                            <select
                                                value={threadForm.categorySlug}
                                                onChange={(e) => setThreadForm({ ...threadForm, categorySlug: e.target.value })}
                                            >
                                                {categories.map(c => (
                                                    <option key={c._id} value={c.slug}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Details / Background *</label>
                                        <textarea
                                            rows="6"
                                            required
                                            placeholder="Provide background on the crop age, soil type, previous sprays, weather conditions, or what solutions you have already tested..."
                                            value={threadForm.body}
                                            onChange={(e) => setThreadForm({ ...threadForm, body: e.target.value })}
                                        />
                                    </div>

                                    <div className="form-actions-row">
                                        <button type="submit" disabled={loading} className="btn-submit-action">
                                            {loading ? "Publishing..." : "💬 Start Discussion"}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>
                )}

                {/* ============================================================== */}
                {/* 4. NOTIFICATIONS TAB: Approval Tracking */}
                {/* ============================================================== */}
                {tab === "notifications" && (
                    <div className="tab-view-content">
                        <div className="notifications-container glass-panel">
                            <h2>Submission & Approval Status</h2>
                            <p className="section-desc">
                                Track the review status of your submitted guides and community discussions.
                            </p>

                            <div className="notif-query-row">
                                <input
                                    type="email"
                                    placeholder="Enter your email address used for submission"
                                    value={notificationEmail}
                                    onChange={(e) => setNotificationEmail(e.target.value)}
                                />
                                <button
                                    type="button"
                                    onClick={loadNotifications}
                                    disabled={notifLoading}
                                    className="btn-query"
                                >
                                    {notifLoading ? "Checking..." : "🔍 Check Status"}
                                </button>
                            </div>

                            <div className="notif-cards-list">
                                {notifications.length === 0 ? (
                                    <div className="empty-state-panel">
                                        <span className="empty-emoji">🔔</span>
                                        <p>No notifications found for this email address.</p>
                                    </div>
                                ) : (
                                    notifications.map(note => (
                                        <div key={note._id} className="notif-item-card glass-panel">
                                            <div className="notif-header">
                                                <span className={`notif-type-tag ${note.type}`}>
                                                    {note.type?.toUpperCase()}
                                                </span>
                                                <span className="notif-time">{new Date(note.createdAt).toLocaleString()}</span>
                                            </div>
                                            <h4>{note.title}</h4>
                                            <p>{note.message}</p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* ============================================================== */}
            {/* READER MODAL: Full Article & Comments */}
            {/* ============================================================== */}
            {selectedPost && (
                <div className="reader-modal-overlay" onClick={() => setSelectedPost(null)}>
                    <div className="reader-modal glass-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="reader-modal-header">
                            <span className="reader-category-pill">
                                {BLOG_CATEGORIES.find(([id]) => id === selectedPost.category)?.[1] || selectedPost.category}
                            </span>
                            <button className="reader-close-btn" onClick={() => setSelectedPost(null)}>✕</button>
                        </div>

                        {selectedPost.coverImage && (
                            <img src={selectedPost.coverImage} alt={selectedPost.title} className="reader-banner-img" />
                        )}

                        <h2 className="reader-post-title">{selectedPost.title}</h2>

                        <div className="reader-meta-bar">
                            <div className="reader-author-info">
                                <div className="avatar-circle">
                                    {(selectedPost.authorName || "A")[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="author-name">{selectedPost.authorName}</div>
                                    <div className="post-date">
                                        Published on {new Date(selectedPost.publishedAt || selectedPost.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                                    </div>
                                </div>
                            </div>
                            <span className="reader-view-count">👁️ {selectedPost.viewCount || 0} views</span>
                        </div>

                        <div className="reader-article-content">
                            {(selectedPost.content || "").split("\n\n").map((para, idx) => (
                                <p key={idx}>{para}</p>
                            ))}
                        </div>

                        {/* Comments Section */}
                        <div className="reader-comments-section">
                            <h3>Comments & Discussion ({(selectedPost.comments || []).length})</h3>

                            <div className="comments-list">
                                {(selectedPost.comments || []).length === 0 ? (
                                    <p className="no-comments-msg">No comments yet. Be the first to share your thoughts or field experience!</p>
                                ) : (
                                    selectedPost.comments.map(c => (
                                        <div key={c._id} className="comment-bubble">
                                            <div className="comment-header">
                                                <span className="comment-author"><strong>{c.authorName}</strong></span>
                                                <span className="comment-date">{new Date(c.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <p className="comment-body">{c.content}</p>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add Comment Form / Gate */}
                            {isAuthenticated ? (
                                <form onSubmit={handleAddComment} className="comment-input-form">
                                    <div className="comment-inputs-row">
                                        <input
                                            type="text"
                                            placeholder="Your name..."
                                            value={commentAuthor}
                                            onChange={(e) => setCommentAuthor(e.target.value)}
                                            className="comment-author-input"
                                        />
                                    </div>
                                    <div className="comment-textarea-wrap">
                                        <textarea
                                            rows="3"
                                            required
                                            placeholder="Add to this discussion..."
                                            value={commentText}
                                            onChange={(e) => setCommentText(e.target.value)}
                                        />
                                        <button
                                            type="submit"
                                            disabled={submittingComment}
                                            className="btn-post-comment"
                                        >
                                            {submittingComment ? "Posting..." : "Post Comment"}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="comment-login-gate">
                                    <span className="comment-gate-icon">🔒</span>
                                    <p>Please log in to leave a comment and share your field experience.</p>
                                    <button
                                        type="button"
                                        className="btn-login-prompt"
                                        onClick={() => navigate("/login?redirect=" + encodeURIComponent("/community"))}
                                    >
                                        Log In to Comment
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ============================================================== */}
            {/* THREAD MODAL: Full Discussion, Verified Solution & Replies */}
            {/* ============================================================== */}
            {selectedThread && (
                <div className="reader-modal-overlay" onClick={() => setSelectedThread(null)}>
                    <div className="reader-modal glass-panel" onClick={(e) => e.stopPropagation()}>
                        <div className="reader-modal-header">
                            <div className="thread-modal-tags">
                                <span className="thread-cat-badge" style={{ color: selectedThread.category?.color || "#10b981" }}>
                                    {selectedThread.category?.name || "General"}
                                </span>
                                {selectedThread.isSolved ? (
                                    <span className="solved-badge">✓ Solved</span>
                                ) : (
                                    <span className="open-badge">💬 Open Discussion</span>
                                )}
                            </div>
                            <button className="reader-close-btn" onClick={() => setSelectedThread(null)}>✕</button>
                        </div>

                        <h2 className="reader-post-title">{selectedThread.title}</h2>

                        <div className="reader-meta-bar">
                            <div className="reader-author-info">
                                <div className="avatar-circle">
                                    {(selectedThread.authorName || "F")[0].toUpperCase()}
                                </div>
                                <div>
                                    <div className="author-name">{selectedThread.authorName}</div>
                                    <div className="post-date">
                                        Started on {new Date(selectedThread.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                                    </div>
                                </div>
                            </div>
                            <div className="thread-top-actions">
                                <button
                                    type="button"
                                    className="upvote-pill"
                                    onClick={() => handleUpvoteThread(selectedThread._id)}
                                >
                                    ▲ {selectedThread.guestUpvoteCount || selectedThread.upvotes?.length || 0} Upvotes
                                </button>
                                <button
                                    type="button"
                                    className="btn-report-flag"
                                    onClick={() => reportItem("forum-thread", selectedThread._id)}
                                    title="Report to admin"
                                >
                                    🚩 Report
                                </button>
                            </div>
                        </div>

                        <div className="thread-question-box">
                            <p>{selectedThread.body}</p>
                        </div>

                        {/* Replies & Solutions */}
                        <div className="reader-comments-section">
                            <h3>Community Answers & Advice ({replies.length})</h3>

                            <div className="replies-flow-list">
                                {replies.length === 0 ? (
                                    <p className="no-comments-msg">No replies yet. Share your experience or agronomy advice below!</p>
                                ) : (
                                    replies.map(reply => (
                                        <div
                                            key={reply._id}
                                            className={`reply-card ${reply.isSolution ? "solution-highlight" : ""}`}
                                        >
                                            {reply.isSolution && (
                                                <div className="solution-verified-ribbon">
                                                    ⭐ Verified Farmer Solution
                                                </div>
                                            )}
                                            <div className="reply-header">
                                                <div className="reply-author-info">
                                                    <span className="author-avatar-small">{(reply.authorName || "C")[0].toUpperCase()}</span>
                                                    <strong>{reply.authorName}</strong>
                                                </div>
                                                <div className="reply-meta-right">
                                                    <span className="reply-date">{new Date(reply.createdAt).toLocaleDateString()}</span>
                                                    <button
                                                        type="button"
                                                        className="mini-report-btn"
                                                        onClick={() => reportItem("forum-reply", reply._id)}
                                                        title="Report inappropriate answer"
                                                    >
                                                        🚩
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="reply-body-text">
                                                {(reply.body || "").split("\n\n").map((p, idx) => (
                                                    <p key={idx}>{p}</p>
                                                ))}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Post a Reply Form / Gate */}
                            {isAuthenticated ? (
                                <form onSubmit={submitReply} className="comment-input-form">
                                    <h4>Contribute to this discussion:</h4>
                                    <div className="comment-inputs-row">
                                        <input
                                            type="text"
                                            placeholder="Your name or credentials..."
                                            value={replyAuthor}
                                            onChange={(e) => setReplyAuthor(e.target.value)}
                                            className="comment-author-input"
                                        />
                                    </div>
                                    <div className="comment-textarea-wrap">
                                        <textarea
                                            rows="3"
                                            required
                                            placeholder="Write your answer or troubleshooting recommendation..."
                                            value={replyBody}
                                            onChange={(e) => setReplyBody(e.target.value)}
                                        />
                                        <button
                                            type="submit"
                                            disabled={submittingReply}
                                            className="btn-post-comment"
                                        >
                                            {submittingReply ? "Submitting..." : "💬 Submit Answer"}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <div className="comment-login-gate">
                                    <span className="comment-gate-icon">🔒</span>
                                    <p>Please log in to contribute an answer or troubleshooting recommendation.</p>
                                    <button
                                        type="button"
                                        className="btn-login-prompt"
                                        onClick={() => navigate("/login?redirect=" + encodeURIComponent("/community"))}
                                    >
                                        Log In to Reply
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Community;
