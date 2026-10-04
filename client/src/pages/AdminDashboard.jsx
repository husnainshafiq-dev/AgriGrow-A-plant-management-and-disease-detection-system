import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import "./AdminDashboard.css";

const ALL_TABS = [
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

    // Role-filtered tabs: Editors cannot access or see the Users tab
    const tabs = ALL_TABS.filter((tab) => {
        if (tab.id === "users" && user?.role === "editor") return false;
        return true;
    });

    useEffect(() => {
        if (user?.role === "editor" && activeTab === "users") {
            setActiveTab("overview");
        }
    }, [user, activeTab]);

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
            const isEditor = user?.role === "editor";
            const [usersData, queriesData, blogData, forumData, diseaseData] = await Promise.all([
                isEditor ? Promise.resolve({ users: [] }) : api("/api/admin/users").catch(() => ({ users: [] })),
                api("/api/admin/queries").catch(() => ({ queries: [] })),
                api("/api/blog/admin/posts").catch(() => ({ posts: [] })),
                api("/api/forum/admin/moderation").catch(() => ({ threads: [], replies: [], reports: [] })),
                api("/api/admin/disease-reports").catch(() => ({ reports: [] })),
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
    }, [authHeaders, user]);

    useEffect(() => { loadAll(); }, [loadAll]);

    /* ── User Management Actions ────────────────────────────── */

    const createUser = async (userData) => {
        try {
            await api("/api/admin/users", {
                method: "POST",
                body: JSON.stringify(userData),
            });
            flash(`User ${userData.name} created successfully.`);
            await loadAll();
            return true;
        } catch (err) {
            flash(err.message);
            return false;
        }
    };

    const promoteUser = async (id, newRole) => {
        try {
            await api(`/api/admin/users/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ role: newRole }),
            });
            flash(`User role updated to ${newRole}.`);
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const toggleUserActive = async (id, isActive) => {
        try {
            await api(`/api/admin/users/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ isActive }),
            });
            flash("User status updated.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const deleteUser = async (id, name, email) => {
        if (!window.confirm(`Are you sure you want to permanently delete user "${name}" (${email})? This action cannot be undone.`)) {
            return;
        }
        try {
            await api(`/api/admin/users/${id}`, {
                method: "DELETE",
            });
            flash(`User "${name}" deleted successfully.`);
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    /* ── Query Moderation Actions ────────────────────────────── */

    const addQuery = async (queryData) => {
        try {
            await api("/api/admin/queries", {
                method: "POST",
                body: JSON.stringify(queryData),
            });
            flash("Query created successfully.");
            await loadAll();
            return true;
        } catch (err) {
            flash(err.message);
            return false;
        }
    };

    const editQuery = async (id, queryData) => {
        try {
            await api(`/api/admin/queries/${id}`, {
                method: "PATCH",
                body: JSON.stringify(queryData),
            });
            flash("Query updated successfully.");
            await loadAll();
            return true;
        } catch (err) {
            flash(err.message);
            return false;
        }
    };

    const toggleKeepQuery = async (id, type, currentKept) => {
        try {
            await api(`/api/admin/queries/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ type, kept: !currentKept }),
            });
            flash(!currentKept ? "Query marked as kept." : "Query un-kept.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const deleteQuery = async (id, type) => {
        if (!window.confirm("Are you sure you want to delete this query?")) return;
        try {
            await api(`/api/admin/queries/${id}?type=${type}`, {
                method: "DELETE",
            });
            flash("Query deleted successfully.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    /* ── Blog Moderation Actions ────────────────────────────── */

    const addBlogPost = async (postData) => {
        try {
            await api("/api/blog/posts", {
                method: "POST",
                body: JSON.stringify(postData),
            });
            flash("Blog post created successfully.");
            await loadAll();
            return true;
        } catch (err) {
            flash(err.message);
            return false;
        }
    };

    const editBlogPost = async (id, postData) => {
        try {
            await api(`/api/blog/admin/posts/${id}`, {
                method: "PATCH",
                body: JSON.stringify(postData),
            });
            flash("Blog post updated.");
            await loadAll();
            return true;
        } catch (err) {
            flash(err.message);
            return false;
        }
    };

    const moderatePost = async (id, status) => {
        try {
            await api(`/api/blog/admin/posts/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            flash(status === "approved" ? "Blog post approved." : "Blog post rejected.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    /* ── Forum & Disease Actions ─────────────────────────────── */

    const moderateThread = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/threads/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Thread updated.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const moderateReply = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/replies/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Reply updated.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const reviewReport = async (id, status) => {
        try {
            await api(`/api/forum/admin/reports/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ status }),
            });
            flash("Report reviewed.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    const toggleDiseaseResolved = async (id, resolved) => {
        try {
            await api(`/api/admin/disease-reports/${id}`, {
                method: "PATCH",
                body: JSON.stringify({ resolved }),
            });
            flash("Disease report updated.");
            await loadAll();
        } catch (err) {
            flash(err.message);
        }
    };

    /* ── Guard: Superadmin, Admin, or Editor ─────────────────── */
    if (user && !["superadmin", "admin", "editor"].includes(user.role)) {
        return (
            <div className="admin-page">
                <div className="admin-denied">
                    <h2>Access Denied</h2>
                    <p>You need administrative or editor privileges to view this page.</p>
                </div>
            </div>
        );
    }

    const roleTitle =
        user?.role === "superadmin"
            ? "👑 Super Admin Dashboard"
            : user?.role === "admin"
            ? "🛡️ Admin Dashboard"
            : "✏️ Content Editor Dashboard";

    return (
        <div className="admin-page">
            <header className="admin-header">
                <div className="admin-header-left">
                    <h1>{roleTitle}</h1>
                    <p>
                        {user?.role === "superadmin"
                            ? "Complete system control: users, permissions, content, and system health"
                            : user?.role === "admin"
                            ? "Manage users, queries, content moderation, and disease tracking"
                            : "Moderate and curate user queries, blog articles, and forum posts"}
                    </p>
                </div>
                <button className="admin-refresh-btn" onClick={loadAll} disabled={loading}>
                    {loading ? "Loading..." : "Refresh All"}
                </button>
            </header>

            {notice && <div className="admin-notice">{notice}</div>}

            <nav className="admin-tabs">
                {tabs.map((tab) => (
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
                    <OverviewTab
                        stats={stats}
                        users={users}
                        queries={queries}
                        blogPosts={blogPosts}
                        diseaseReports={diseaseReports}
                        currentUser={user}
                    />
                )}
                {activeTab === "users" && user?.role !== "editor" && (
                    <UsersTab
                        users={users}
                        currentUser={user}
                        onToggle={toggleUserActive}
                        onPromote={promoteUser}
                        onDelete={deleteUser}
                        onCreateUser={createUser}
                    />
                )}
                {activeTab === "queries" && (
                    <QueriesTab
                        queries={queries}
                        onToggleKeep={toggleKeepQuery}
                        onDelete={deleteQuery}
                        onAddQuery={addQuery}
                        onEditQuery={editQuery}
                    />
                )}
                {activeTab === "blog" && (
                    <BlogTab
                        posts={blogPosts}
                        onApprove={(id) => moderatePost(id, "approved")}
                        onReject={(id) => moderatePost(id, "rejected")}
                        onAddPost={addBlogPost}
                        onEditPost={editBlogPost}
                    />
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
function OverviewTab({ stats, users, queries, blogPosts, diseaseReports, currentUser }) {
    const pendingPosts = blogPosts.filter((p) => p.status === "pending").length;
    const unresolvedDiseases = diseaseReports.filter((r) => !r.resolved).length;
    const isEditor = currentUser?.role === "editor";

    return (
        <div className="admin-overview">
            <div className="stats-grid">
                {!isEditor && <StatCard icon="👤" label="Total Users" value={stats.users} color="#3b82f6" />}
                <StatCard icon="❓" label="User Queries" value={stats.queries} color="#10b981" />
                <StatCard icon="📝" label="Blog Posts" value={stats.blogPosts} color="#f59e0b" sub={`${pendingPosts} pending`} />
                <StatCard icon="💬" label="Forum Threads" value={stats.forumThreads} color="#8b5cf6" />
                <StatCard icon="🦠" label="Disease Reports" value={stats.diseaseReports} color="#ef4444" sub={`${unresolvedDiseases} unresolved`} />
            </div>

            <div className="overview-grid">
                {!isEditor && (
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
                )}

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
   USERS TAB (Superadmin & Admin Only)
   ================================================================ */
function UsersTab({ users, currentUser, onToggle, onPromote, onDelete, onCreateUser }) {
    const [search, setSearch] = useState("");
    const [showAddModal, setShowAddModal] = useState(false);

    const isSuperAdmin = currentUser?.role === "superadmin";
    const isAdmin = currentUser?.role === "admin";

    const filtered = users.filter((u) =>
        u.name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.role?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="admin-section">
            <div className="section-header">
                <div className="section-title-wrap">
                    <h2>User Management</h2>
                    <span className="user-count-tag">{users.length} Total Users</span>
                </div>
                <div className="section-actions-wrap">
                    <button className="admin-primary-btn" onClick={() => setShowAddModal(true)}>
                        <span className="btn-icon">➕</span> Add User
                    </button>
                    <input
                        className="admin-search"
                        placeholder="Search by name, email, or role..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className="table-wrap">
                <table className="admin-table">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role & Promotion</th>
                            <th>Status</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((u) => {
                            const isSelf = u._id === currentUser?._id || u.email === currentUser?.email;

                            // Role edit permission logic:
                            // Superadmin can promote/demote anyone (to farmer, editor, admin, superadmin)
                            // Admin can promote/demote between farmer and editor only
                            let canEditRole = false;
                            let allowedRoleOptions = [];

                            if (isSuperAdmin) {
                                canEditRole = true;
                                allowedRoleOptions = [
                                    { value: "farmer", label: "🌱 Farmer" },
                                    { value: "editor", label: "✏️ Editor" },
                                    { value: "admin", label: "🛡️ Admin" },
                                    { value: "superadmin", label: "👑 Super Admin" },
                                ];
                            } else if (isAdmin) {
                                if (u.role === "farmer" || u.role === "editor") {
                                    canEditRole = true;
                                    allowedRoleOptions = [
                                        { value: "farmer", label: "🌱 Farmer" },
                                        { value: "editor", label: "✏️ Editor" },
                                    ];
                                }
                            }

                            // Status modification permission:
                            // Cannot deactivate self. Admin cannot touch admin or superadmin.
                            const canToggleStatus =
                                !isSelf &&
                                (isSuperAdmin || (isAdmin && (u.role === "farmer" || u.role === "editor")));

                            // Deletion permission:
                            // Cannot delete self. Admin cannot delete admin or superadmin.
                            const canDelete =
                                !isSelf &&
                                (isSuperAdmin || (isAdmin && (u.role === "farmer" || u.role === "editor")));

                            return (
                                <tr key={u._id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="table-avatar">{u.name?.[0] || "?"}</div>
                                            <div className="user-name-col">
                                                <span className="user-name">{u.name}</span>
                                                {isSelf && <span className="self-tag">(You)</span>}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="email-cell">{u.email}</td>
                                    <td>
                                        {canEditRole ? (
                                            <div className="role-selector-wrap">
                                                <select
                                                    className={`role-select ${u.role}`}
                                                    value={u.role}
                                                    onChange={(e) => onPromote(u._id, e.target.value)}
                                                    title="Change user role"
                                                >
                                                    {allowedRoleOptions.map((opt) => (
                                                        <option key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        ) : (
                                            <span className={`role-badge ${u.role}`}>
                                                {u.role === "superadmin"
                                                    ? "👑 Super Admin"
                                                    : u.role === "admin"
                                                    ? "🛡️ Admin"
                                                    : u.role === "editor"
                                                    ? "✏️ Editor"
                                                    : "🌱 Farmer"}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`status-dot ${u.isActive ? "active" : "inactive"}`} />
                                        {u.isActive ? "Active" : "Inactive"}
                                    </td>
                                    <td className="date-cell">{new Date(u.createdAt).toLocaleDateString()}</td>
                                    <td>
                                        <div className="row-actions">
                                            {canToggleStatus ? (
                                                <button
                                                    className={`action-btn ${u.isActive ? "deactivate" : "activate"}`}
                                                    onClick={() => onToggle(u._id, !u.isActive)}
                                                >
                                                    {u.isActive ? "Deactivate" : "Activate"}
                                                </button>
                                            ) : (
                                                <button className="action-btn disabled" disabled title="Cannot alter this status">
                                                    Locked
                                                </button>
                                            )}

                                            {canDelete && (
                                                <button
                                                    className="action-btn delete"
                                                    onClick={() => onDelete(u._id, u.name, u.email)}
                                                    title="Delete this user permanently"
                                                >
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!filtered.length && (
                            <tr>
                                <td colSpan="6" className="empty-text">No users found matching your search.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showAddModal && (
                <AddUserModal
                    currentUser={currentUser}
                    onClose={() => setShowAddModal(false)}
                    onCreate={onCreateUser}
                />
            )}
        </div>
    );
}

/* ================================================================
   ADD USER MODAL
   ================================================================ */
function AddUserModal({ currentUser, onClose, onCreate }) {
    const isSuperAdmin = currentUser?.role === "superadmin";

    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
        phone: "",
        role: "farmer",
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!form.name.trim() || form.name.length < 2) {
            setError("Full name must be at least 2 characters.");
            return;
        }
        if (!form.email.trim() || !form.email.includes("@")) {
            setError("Please provide a valid email address.");
            return;
        }
        if (!form.password || form.password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }

        setSubmitting(true);
        const success = await onCreate(form);
        setSubmitting(false);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>➕ Add New User</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>

                {error && <div className="modal-error-alert">{error}</div>}

                <form onSubmit={handleSubmit} className="admin-modal-form">
                    <div className="form-group">
                        <label>Full Name *</label>
                        <input
                            type="text"
                            placeholder="e.g. Tariq Mehmood"
                            value={form.name}
                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Email Address *</label>
                        <input
                            type="email"
                            placeholder="e.g. tariq@agrigrow.pk"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Temporary Password * (Min 6 chars)</label>
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>Phone Number (Optional)</label>
                        <input
                            type="text"
                            placeholder="e.g. +923001234567"
                            value={form.phone}
                            onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Assign Role *</label>
                        <select
                            value={form.role}
                            onChange={(e) => setForm({ ...form, role: e.target.value })}
                        >
                            <option value="farmer">🌱 Farmer (Standard User)</option>
                            <option value="editor">✏️ Editor (Moderate & Edit Content)</option>
                            {isSuperAdmin && (
                                <>
                                    <option value="admin">🛡️ Administrator (Manage Operations)</option>
                                    <option value="superadmin">👑 Super Admin (Full Control)</option>
                                </>
                            )}
                        </select>
                        {!isSuperAdmin && (
                            <small className="form-hint">
                                Administrators can create Farmer and Editor accounts. Super Admin accounts can only be created by a Super Admin.
                            </small>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
                            Cancel
                        </button>
                        <button type="submit" className="admin-primary-btn" disabled={submitting}>
                            {submitting ? "Creating..." : "Create User"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ================================================================
   QUERIES TAB (Superadmin, Admin, Editor)
   ================================================================ */
function QueriesTab({ queries, onToggleKeep, onDelete, onAddQuery, onEditQuery }) {
    const [search, setSearch] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingQuery, setEditingQuery] = useState(null);

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
                <div className="section-title-wrap">
                    <h2>User Queries & Advisories</h2>
                    <button className="admin-primary-btn" onClick={() => setShowAddModal(true)}>
                        <span className="btn-icon">➕</span> Add Query
                    </button>
                </div>
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
                                {q.kept ? "Kept" : q.status || "Open"}
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
                                className="action-btn"
                                onClick={() => setEditingQuery(q)}
                            >
                                Edit
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

            {showAddModal && (
                <AddQueryModal onClose={() => setShowAddModal(false)} onAdd={onAddQuery} />
            )}

            {editingQuery && (
                <EditQueryModal
                    query={editingQuery}
                    onClose={() => setEditingQuery(null)}
                    onSave={onEditQuery}
                />
            )}
        </div>
    );
}

function AddQueryModal({ onClose, onAdd }) {
    const [form, setForm] = useState({
        type: "question",
        title: "",
        body: "",
        category: "disease",
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const success = await onAdd(form);
        setSubmitting(false);
        if (success) onClose();
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>➕ Add New Query</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="admin-modal-form">
                    <div className="form-group">
                        <label>Query Type</label>
                        <select
                            value={form.type}
                            onChange={(e) => setForm({ ...form, type: e.target.value })}
                        >
                            <option value="question">User Question</option>
                            <option value="advisory">Advisory Record</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Title / Query Question *</label>
                        <input
                            type="text"
                            placeholder="e.g. How to prevent wheat rust?"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Body / Response *</label>
                        <textarea
                            rows="4"
                            placeholder="Detailed explanation or advisory solution..."
                            value={form.body}
                            onChange={(e) => setForm({ ...form, body: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <select
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                            <option value="disease">Disease & Pest</option>
                            <option value="crop-planning">Crop Planning</option>
                            <option value="soil">Soil Management</option>
                            <option value="irrigation">Irrigation</option>
                            <option value="market">Market & Pricing</option>
                            <option value="general">General</option>
                        </select>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="admin-primary-btn" disabled={submitting}>
                            {submitting ? "Saving..." : "Add Query"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function EditQueryModal({ query, onClose, onSave }) {
    const [form, setForm] = useState({
        title: query.title || "",
        body: query.body || "",
        category: query.category || "disease",
        status: query.status || "open",
        kept: !!query.kept,
        type: query.type,
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const success = await onSave(query._id, form);
        setSubmitting(false);
        if (success) onClose();
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>✏️ Edit Query / Advisory</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="admin-modal-form">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Details / Content</label>
                        <textarea
                            rows="4"
                            value={form.body}
                            onChange={(e) => setForm({ ...form, body: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                <option value="open">Open</option>
                                <option value="resolved">Resolved</option>
                                <option value="answered">Answered</option>
                                <option value="closed">Closed</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Keep in Highlights</label>
                            <select
                                value={form.kept ? "true" : "false"}
                                onChange={(e) => setForm({ ...form, kept: e.target.value === "true" })}
                            >
                                <option value="true">Yes (Kept)</option>
                                <option value="false">No (Standard)</option>
                            </select>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="admin-primary-btn" disabled={submitting}>
                            {submitting ? "Updating..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

/* ================================================================
   BLOG TAB (Superadmin, Admin, Editor)
   ================================================================ */
function BlogTab({ posts, onApprove, onReject, onAddPost, onEditPost }) {
    const [filter, setFilter] = useState("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingPost, setEditingPost] = useState(null);

    const filtered = posts.filter((p) => filter === "all" || p.status === filter);

    return (
        <div className="admin-section">
            <div className="section-header">
                <div className="section-title-wrap">
                    <h2>Blog Moderation & Articles</h2>
                    <button className="admin-primary-btn" onClick={() => setShowAddModal(true)}>
                        <span className="btn-icon">➕</span> Add Post
                    </button>
                </div>
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
                            <button className="action-btn" onClick={() => setEditingPost(post)}>Edit</button>
                        </div>
                    </div>
                ))}
                {!filtered.length && <p className="empty-text">No blog posts match this filter.</p>}
            </div>

            {showAddModal && (
                <AddPostModal onClose={() => setShowAddModal(false)} onAdd={onAddPost} />
            )}

            {editingPost && (
                <EditPostModal
                    post={editingPost}
                    onClose={() => setEditingPost(null)}
                    onSave={onEditPost}
                />
            )}
        </div>
    );
}

function AddPostModal({ onClose, onAdd }) {
    const [form, setForm] = useState({
        title: "",
        content: "",
        category: "crop-guides",
        tags: "farming,agriculture",
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const success = await onAdd({
            ...form,
            tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
        });
        setSubmitting(false);
        if (success) onClose();
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>➕ Create Blog Post</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="admin-modal-form">
                    <div className="form-group">
                        <label>Title *</label>
                        <input
                            type="text"
                            placeholder="e.g. Best Irrigation Practices for Cotton"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Category</label>
                        <select
                            value={form.category}
                            onChange={(e) => setForm({ ...form, category: e.target.value })}
                        >
                            <option value="crop-guides">Crop Guides</option>
                            <option value="disease-treatment">Disease Treatment</option>
                            <option value="soil-care">Soil Care</option>
                            <option value="weather-tips">Weather Tips</option>
                            <option value="success-stories">Success Stories</option>
                            <option value="general">General</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label>Tags (Comma separated)</label>
                        <input
                            type="text"
                            placeholder="cotton, irrigation, summer"
                            value={form.tags}
                            onChange={(e) => setForm({ ...form, tags: e.target.value })}
                        />
                    </div>
                    <div className="form-group">
                        <label>Article Content * (Min 30 chars)</label>
                        <textarea
                            rows="6"
                            placeholder="Write comprehensive article content..."
                            value={form.content}
                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                            required
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="admin-primary-btn" disabled={submitting}>
                            {submitting ? "Publishing..." : "Submit Post"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function EditPostModal({ post, onClose, onSave }) {
    const [form, setForm] = useState({
        title: post.title || "",
        content: post.content || "",
        category: post.category || "crop-guides",
        status: post.status || "pending",
    });
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        const success = await onSave(post._id, form);
        setSubmitting(false);
        if (success) onClose();
    };

    return (
        <div className="admin-modal-overlay" onClick={onClose}>
            <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>✏️ Edit Blog Post</h3>
                    <button className="modal-close-btn" onClick={onClose}>✕</button>
                </div>
                <form onSubmit={handleSubmit} className="admin-modal-form">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-row">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Category</label>
                            <select
                                value={form.category}
                                onChange={(e) => setForm({ ...form, category: e.target.value })}
                            >
                                <option value="crop-guides">Crop Guides</option>
                                <option value="disease-treatment">Disease Treatment</option>
                                <option value="soil-care">Soil Care</option>
                                <option value="weather-tips">Weather Tips</option>
                                <option value="success-stories">Success Stories</option>
                                <option value="general">General</option>
                            </select>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Moderation Status</label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                            >
                                <option value="approved">Approved</option>
                                <option value="pending">Pending</option>
                                <option value="rejected">Rejected</option>
                            </select>
                        </div>
                    </div>
                    <div className="form-group">
                        <label>Content</label>
                        <textarea
                            rows="6"
                            value={form.content}
                            onChange={(e) => setForm({ ...form, content: e.target.value })}
                            required
                        />
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="admin-primary-btn" disabled={submitting}>
                            {submitting ? "Updating..." : "Update Post"}
                        </button>
                    </div>
                </form>
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
