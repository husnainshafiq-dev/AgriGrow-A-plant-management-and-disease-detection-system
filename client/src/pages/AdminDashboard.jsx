import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import "./AdminDashboard.css";

const TABS = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "users", label: "Users", icon: "👤" },
    { id: "queries", label: "Queries", icon: "❓" },
    { id: "blog", label: "Blog Posts", icon: "📝" },
    { id: "forum", label: "Forum", icon: "💬" },
    { id: "diseases", label: "Disease Reports", icon: "🦠" },
];

export default function AdminDashboard() {
    const { user, authHeaders } = useAuth();
    const [activeTab, setActiveTab] = useState("overview");
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState("");

    const [stats, setStats] = useState({ users: 0, queries: 0, blogPosts: 0, forumThreads: 0, diseaseReports: 0 });
    const [users, setUsers] = useState([]);
    const [queries, setQueries] = useState([]);
    const [blogPosts, setBlogPosts] = useState([]);
    const [forumThreads, setForumThreads] = useState([]);
    const [forumReplies, setForumReplies] = useState([]);
    const [reports, setReports] = useState([]);
    const [diseaseReports, setDiseaseReports] = useState([]);

    const flash = (msg) => {
        setNotice(msg);
        setTimeout(() => setNotice(""), 3500);
    };

    const api = async (url, options = {}) => {
        const res = await fetch(url, {
            credentials: "include",
            ...options,
            headers: {
                ...authHeaders(),
                ...(options.body ? { "Content-Type": "application/json" } : {}),
                ...(options.headers || {}),
            },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(data.error || data.message || "Request failed");
        return data.data || data;
    };

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [usersData, queriesData, blogData, forumData, diseaseData] = await Promise.all([
                api("/api/admin/users"),
                api("/api/admin/queries").catch(() => ({ queries: [] })),
                api("/api/blog/admin/posts"),
                api("/api/forum/admin/moderation"),
                api("/api/admin/disease-reports"),
            ]);

            const userList = usersData.users || [];
            const queryList = queriesData.queries || [];
            const blogList = blogData.posts || [];
            const threadList = forumData.threads || [];
            const replyList = forumData.replies || [];
            const reportList = forumData.reports || [];
            const diseaseList = diseaseData.reports || [];

            setUsers(userList);
            setQueries(queryList);
            setBlogPosts(blogList);
            setForumThreads(threadList);
            setForumReplies(replyList);
            setReports(reportList);
            setDiseaseReports(diseaseList);
            setStats({
                users: userList.length,
                queries: queryList.length,
                blogPosts: blogList.length,
                forumThreads: threadList.length,
                diseaseReports: diseaseList.length,
            });
        } catch (err) {
            flash(err.message);
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    useEffect(() => { loadAll(); }, [loadAll]);

    /* ── Actions ────────────────────────────────────────────── */

    const toggleKeepQuery = async (id, type, currentKept) => {
        try {
            await api(`/api/admin/queries/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ type, kept: !currentKept }),
            });
            flash(!currentKept ? "Query marked as kept." : "Query un-kept.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const deleteQuery = async (id, type) => {
        if (!window.confirm("Are you sure you want to delete this query?")) return;
        try {
            await api(`/api/admin/queries/${id}?type=${type}`, {
                method: "DELETE",
            });
            flash("Query deleted successfully.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const moderatePost = async (id, status) => {
        try {
            await api(`/api/blog/admin/posts/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            flash(status === "approved" ? "Blog post approved." : "Blog post rejected.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const moderateThread = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/threads/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Thread updated.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const moderateReply = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/replies/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Reply updated.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const reviewReport = async (id, status) => {
        try {
            await api(`/api/forum/admin/reports/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            flash("Report reviewed.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const toggleUserActive = async (id, isActive) => {
        try {
            await api(`/api/admin/users/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive }),
            });
            flash("User status updated.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    const toggleDiseaseResolved = async (id, resolved) => {
        try {
            await api(`/api/admin/disease-reports/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ resolved }),
            });
            flash("Disease report updated.");
            await loadAll();
        } catch (err) { flash(err.message); }
    };

    /* ── Guard: only admin ──────────────────────────────────── */
    if (user && user.role !== "admin") {
        return (
            <div className="admin-page">
                <div className="admin-denied">
                    <h2>Access Denied</h2>
                    <p>You need admin privileges to view this page.</p>
                </div>
            </div>
        );
    }

    /* ── Render ─────────────────────────────────────────────── */
    return (
        <div className="admin-page">
            <header className="admin-header">
                <div className="admin-header-left">
                    <h1>Admin Dashboard</h1>
                    <p>Manage users, content, queries, and system health</p>
                </div>
                <button className="admin-refresh-btn" onClick={loadAll} disabled={loading}>
                    {loading ? "Loading..." : "Refresh All"}
                </button>
            </header>

            {notice && <div className="admin-notice">{notice}</div>}

            <nav className="admin-tabs">
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        className={`admin-tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="tab-icon">{tab.icon}</span>
                        <span className="tab-label">{tab.label}</span>
                        {tab.id === "queries" && queries.length > 0 && (
                            <span className="tab-badge">{queries.length}</span>
                        )}
                        {tab.id === "blog" && blogPosts.length > 0 && (
                            <span className="tab-badge">{blogPosts.length}</span>
                        )}
                        {tab.id === "forum" && (forumThreads.length + forumReplies.length + reports.length) > 0 && (
                            <span className="tab-badge">{forumThreads.length + forumReplies.length + reports.length}</span>
                        )}
                        {tab.id === "diseases" && diseaseReports.length > 0 && (
                            <span className="tab-badge">{diseaseReports.length}</span>
                        )}
                    </button>
                ))}
            </nav>

            <main className="admin-content">
                {activeTab === "overview" && (
                    <OverviewTab stats={stats} users={users} queries={queries} blogPosts={blogPosts} diseaseReports={diseaseReports} />
                )}
                {activeTab === "users" && (
                    <UsersTab users={users} onToggle={toggleUserActive} />
                )}
                {activeTab === "queries" && (
                    <QueriesTab queries={queries} onToggleKeep={toggleKeepQuery} onDelete={deleteQuery} />
                )}
                {activeTab === "blog" && (
                    <BlogTab posts={blogPosts} onApprove={(id) => moderatePost(id, "approved")} onReject={(id) => moderatePost(id, "rejected")} />
                )}
                {activeTab === "forum" && (
                    <ForumTab
                        threads={forumThreads}
                        replies={forumReplies}
                        reports={reports}
                        onModerateThread={moderateThread}
                        onModerateReply={moderateReply}
                        onReviewReport={reviewReport}
                    />
                )}
                {activeTab === "diseases" && (
                    <DiseasesTab reports={diseaseReports} onToggle={toggleDiseaseResolved} />
                )}
            </main>
        </div>
    );
}

/* ================================================================
   OVERVIEW TAB
   ================================================================ */
function OverviewTab({ stats, users, queries, blogPosts, diseaseReports }) {
    const pendingPosts = blogPosts.filter((p) => p.status === "pending").length;
    const unresolvedDiseases = diseaseReports.filter((r) => !r.resolved).length;

    return (
        <div className="admin-overview">
            <div className="stats-grid">
                <StatCard icon="👤" label="Total Users" value={stats.users} color="#3b82f6" />
                <StatCard icon="❓" label="User Queries" value={stats.queries} color="#10b981" />
                <StatCard icon="📝" label="Blog Posts" value={stats.blogPosts} color="#f59e0b" sub={`${pendingPosts} pending`} />
                <StatCard icon="💬" label="Forum Threads" value={stats.forumThreads} color="#8b5cf6" />
                <StatCard icon="🦠" label="Disease Reports" value={stats.diseaseReports} color="#ef4444" sub={`${unresolvedDiseases} unresolved`} />
            </div>

            <div className="overview-grid">
                <div className="overview-card">
                    <h3>Recent Users</h3>
                    <div className="overview-list">
                        {users.slice(0, 5).map((u) => (
                            <div className="overview-item" key={u._id}>
                                <div className="overview-avatar">{u.name?.[0] || "?"}</div>
                                <div>
                                    <strong>{u.name}</strong>
                                    <small>{u.email}</small>
                                </div>
                                <span className={`role-badge ${u.role}`}>{u.role}</span>
                            </div>
                        ))}
                        {!users.length && <p className="empty-text">No users found.</p>}
                    </div>
                </div>

                <div className="overview-card">
                    <h3>Recent User Queries</h3>
                    <div className="overview-list">
                        {queries.slice(0, 5).map((q) => (
                            <div className="overview-item" key={q._id}>
                                <div>
                                    <strong>{q.title}</strong>
                                    <small>By {q.user?.name || q.user?.email || "Anonymous"} · {new Date(q.createdAt).toLocaleDateString()}</small>
                                </div>
                                <span className={`status-badge ${q.kept ? "approved" : "pending"}`}>{q.kept ? "Kept" : "Open"}</span>
                            </div>
                        ))}
                        {!queries.length && <p className="empty-text">No queries submitted yet.</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ icon, label, value, color, sub }) {
    return (
        <div className="stat-card" style={{ borderTopColor: color }}>
            <div className="stat-icon" style={{ background: color + "22", color }}>{icon}</div>
            <div className="stat-info">
                <span className="stat-value">{value}</span>
                <span className="stat-label">{label}</span>
                {sub && <span className="stat-sub">{sub}</span>}
            </div>
        </div>
    );
}

/* ================================================================
   USERS TAB
   ================================================================ */
function UsersTab({ users, onToggle }) {
    const [search, setSearch] = useState("");

    const filtered = users.filter((u) =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-section">
            <div className="section-header">
                <h2>User Management</h2>
                <input
                    className="admin-search"
                    placeholder="Search by name or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <div className="table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u) => (
                            <tr key={u._id}>
                                <td>
                                    <div className="user-cell">
                                        <div className="table-avatar">{u.name?.[0] || "?"}</div>
                                        <span>{u.name}</span>
                                    </div>
                                </td>
                                <td className="email-cell">{u.email}</td>
                                <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
                                <td><span className={`status-dot ${u.isActive ? "active" : "inactive"}`} />{u.isActive ? "Active" : "Inactive"}</td>
                                <td className="date-cell">{new Date(u.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <button
                                        className={`action-btn ${u.isActive ? "deactivate" : "activate"}`}
                                        onClick={() => onToggle(u._id, !u.isActive)}
                                    >
                                        {u.isActive ? "Deactivate" : "Activate"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!filtered.length && <tr><td colSpan="6" className="empty-text">No users found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

/* ================================================================
   QUERIES TAB
   ================================================================ */
function QueriesTab({ queries, onToggleKeep, onDelete }) {
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState("all");

    const filtered = queries.filter((q) => {
        const matchesSearch =
            q.title?.toLowerCase().includes(search.toLowerCase()) ||
            q.body?.toLowerCase().includes(search.toLowerCase()) ||
            q.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
            q.user?.email?.toLowerCase().includes(search.toLowerCase());
        const matchesType = filterType === "all" || q.type === filterType;
        return matchesSearch && matchesType;
    });

    return (
        <div className="admin-section">
            <div className="section-header">
                <h2>User Queries Moderation</h2>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <div className="filter-group">
                        <button
                            className={`filter-btn ${filterType === "all" ? "active" : ""}`}
                            onClick={() => setFilterType("all")}
                        >
                            All ({queries.length})
                        </button>
                        <button
                            className={`filter-btn ${filterType === "question" ? "active" : ""}`}
                            onClick={() => setFilterType("question")}
                        >
                            Questions
                        </button>
                        <button
                            className={`filter-btn ${filterType === "advisory" ? "active" : ""}`}
                            onClick={() => setFilterType("advisory")}
                        >
                            Advisories
                        </button>
                    </div>
                    <input
                        className="admin-search"
                        placeholder="Search queries..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="card-grid">
                {filtered.map((q) => (
                    <div className="admin-card" key={q._id}>
                        <div className="card-header">
                            <span className={`status-badge ${q.kept ? "approved" : "pending"}`}>
                                {q.kept ? "Kept" : (q.status || "Open")}
                            </span>
                            <small>{new Date(q.createdAt).toLocaleDateString()}</small>
                        </div>
                        <h3>{q.title}</h3>
                        <p className="card-excerpt">{q.body?.slice(0, 180)}{q.body?.length > 180 ? "..." : ""}</p>
                        <div className="card-meta">
                            <span>User: {q.user?.name || q.user?.email || "Anonymous"}</span>
                            <span>Category: {q.category}</span>
                            <span>Type: {q.type}</span>
                        </div>
                        <div className="card-actions">
                            <button
                                className={`action-btn ${q.kept ? "deactivate" : "approve"}`}
                                onClick={() => onToggleKeep(q._id, q.type, q.kept)}
                            >
                                {q.kept ? "Un-keep" : "Keep Query"}
                            </button>
                            <button
                                className="action-btn reject"
                                onClick={() => onDelete(q._id, q.type)}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
                {!filtered.length && <p className="empty-text">No user queries match your search or filter.</p>}
            </div>
        </div>
    );
}

/* ================================================================
   BLOG TAB
   ================================================================ */
function BlogTab({ posts, onApprove, onReject }) {
    const [filter, setFilter] = useState("all");

    const filtered = posts.filter((p) => filter === "all" || p.status === filter);

    return (
        <div className="admin-section">
            <div className="section-header">
                <h2>Blog Moderation</h2>
                <div className="filter-group">
                    {["all", "pending", "approved", "rejected"].map((f) => (
                        <button
                            key={f}
                            className={`filter-btn ${filter === f ? "active" : ""}`}
                            onClick={() => setFilter(f)}
                        >
                            {f[0].toUpperCase() + f.slice(1)}
                        </button>
                    ))}
                </div>
            </div>
            <div className="card-grid">
                {filtered.map((post) => (
                    <div className="admin-card" key={post._id}>
                        <div className="card-header">
                            <span className={`status-badge ${post.status}`}>{post.status}</span>
                            <small>{new Date(post.createdAt).toLocaleDateString()}</small>
                        </div>
                        <h3>{post.title}</h3>
                        <p className="card-excerpt">{post.content?.slice(0, 150)}...</p>
                        <div className="card-meta">
                            <span>By {post.authorName || "Unknown"}</span>
                            <span>Category: {post.category || "General"}</span>
                        </div>
                        <div className="card-actions">
                            {post.status !== "approved" && (
                                <button className="action-btn approve" onClick={() => onApprove(post._id)}>Approve</button>
                            )}
                            {post.status !== "rejected" && (
                                <button className="action-btn reject" onClick={() => onReject(post._id)}>Reject</button>
                            )}
                        </div>
                    </div>
                ))}
                {!filtered.length && <p className="empty-text">No blog posts match this filter.</p>}
            </div>
        </div>
    );
}

/* ================================================================
   FORUM TAB
   ================================================================ */
function ForumTab({ threads, replies, reports, onModerateThread, onModerateReply, onReviewReport }) {
    const [subTab, setSubTab] = useState("threads");

    return (
        <div className="admin-section">
            <div className="section-header">
                <h2>Forum Moderation</h2>
                <div className="filter-group">
                    <button className={`filter-btn ${subTab === "threads" ? "active" : ""}`} onClick={() => setSubTab("threads")}>
                        Threads ({threads.length})
                    </button>
                    <button className={`filter-btn ${subTab === "replies" ? "active" : ""}`} onClick={() => setSubTab("replies")}>
                        Replies ({replies.length})
                    </button>
                    <button className={`filter-btn ${subTab === "reports" ? "active" : ""}`} onClick={() => setSubTab("reports")}>
                        Reports ({reports.length})
                    </button>
                </div>
            </div>

            {subTab === "threads" && (
                <div className="card-grid">
                    {threads.map((t) => (
                        <div className="admin-card" key={t._id}>
                            <div className="card-header">
                                <span className={`status-badge ${t.moderationStatus}`}>{t.moderationStatus}</span>
                                {t.isSolved && <span className="status-badge approved">Solved</span>}
                            </div>
                            <h3>{t.title}</h3>
                            <p className="card-excerpt">{t.body?.slice(0, 150)}</p>
                            <div className="card-actions">
                                <button className="action-btn approve" onClick={() => onModerateThread(t._id, "approved")}>Approve</button>
                                <button className="action-btn" onClick={() => onModerateThread(t._id, "hidden")}>Hide</button>
                                <button className="action-btn reject" onClick={() => onModerateThread(t._id, "rejected")}>Reject</button>
                            </div>
                        </div>
                    ))}
                    {!threads.length && <p className="empty-text">No threads pending moderation.</p>}
                </div>
            )}

            {subTab === "replies" && (
                <div className="card-grid">
                    {replies.map((r) => (
                        <div className="admin-card" key={r._id}>
                            <div className="card-header">
                                <span className={`status-badge ${r.moderationStatus}`}>{r.moderationStatus}</span>
                            </div>
                            <p className="card-excerpt">{r.body?.slice(0, 200)}</p>
                            <div className="card-meta">
                                <span>By {r.authorName || "Unknown"}</span>
                            </div>
                            <div className="card-actions">
                                <button className="action-btn approve" onClick={() => onModerateReply(r._id, "approved")}>Approve</button>
                                <button className="action-btn" onClick={() => onModerateReply(r._id, "hidden")}>Hide</button>
                                <button className="action-btn reject" onClick={() => onModerateReply(r._id, "rejected")}>Reject</button>
                            </div>
                        </div>
                    ))}
                    {!replies.length && <p className="empty-text">No replies pending moderation.</p>}
                </div>
            )}

            {subTab === "reports" && (
                <div className="card-grid">
                    {reports.map((r) => (
                        <div className="admin-card" key={r._id}>
                            <div className="card-header">
                                <span className="status-badge pending">{r.targetType}</span>
                            </div>
                            <h3>Report: {r.reason}</h3>
                            <p className="card-excerpt">{r.details || "No additional details provided."}</p>
                            <div className="card-actions">
                                <button className="action-btn approve" onClick={() => onReviewReport(r._id, "reviewed")}>Mark Reviewed</button>
                                <button className="action-btn reject" onClick={() => onReviewReport(r._id, "dismissed")}>Dismiss</button>
                            </div>
                        </div>
                    ))}
                    {!reports.length && <p className="empty-text">No reports to review.</p>}
                </div>
            )}
        </div>
    );
}

/* ================================================================
   DISEASES TAB
   ================================================================ */
function DiseasesTab({ reports, onToggle }) {
    return (
        <div className="admin-section">
            <div className="section-header">
                <h2>Disease Reports</h2>
            </div>
            <div className="table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>Disease</th>
                            <th>Confidence</th>
                            <th>Status</th>
                            <th>User</th>
                            <th>Date</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reports.map((r) => (
                            <tr key={r._id}>
                                <td>
                                    <div className="disease-cell">
                                        <span className={r.prediction?.isHealthy ? "healthy" : "diseased"}>
                                            {r.prediction?.isHealthy ? "Healthy" : r.prediction?.disease || "Unknown"}
                                        </span>
                                    </div>
                                </td>
                                <td>{Number(r.prediction?.confidence || 0).toFixed(1)}%</td>
                                <td>
                                    <span className={`status-badge ${r.resolved ? "approved" : "pending"}`}>
                                        {r.resolved ? "Resolved" : "Open"}
                                    </span>
                                </td>
                                <td className="email-cell">{r.user?.email || "N/A"}</td>
                                <td className="date-cell">{new Date(r.createdAt).toLocaleDateString()}</td>
                                <td>
                                    <button
                                        className={`action-btn ${r.resolved ? "deactivate" : "activate"}`}
                                        onClick={() => onToggle(r._id, !r.resolved)}
                                    >
                                        {r.resolved ? "Mark Open" : "Mark Resolved"}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!reports.length && <tr><td colSpan="6" className="empty-text">No disease reports found.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
