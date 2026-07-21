import { useEffect, useMemo, useState } from "react";
import "./Community.css";

const BLOG_CATEGORIES = [
    ["disease-treatment", "Disease treatment"],
    ["crop-guides", "Crop guides"],
    ["soil-care", "Soil care"],
    ["weather-tips", "Weather tips"],
    ["success-stories", "Success stories"],
    ["general", "General"],
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
    const [tab, setTab] = useState("blog");
    const [adminToken, setAdminToken] = useState(() => localStorage.getItem("agrigrow_admin_token") || "");
    const [notice, setNotice] = useState("");
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [postForm, setPostForm] = useState(emptyPost);
    const [adminPosts, setAdminPosts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [threads, setThreads] = useState([]);
    const [selectedThread, setSelectedThread] = useState(null);
    const [replies, setReplies] = useState([]);
    const [threadForm, setThreadForm] = useState(emptyThread);
    const [replyBody, setReplyBody] = useState("");
    const [moderation, setModeration] = useState({
        threads: [],
        replies: [],
        reports: [],
        users: [],
        diseaseReports: [],
    });
    const [notificationEmail, setNotificationEmail] = useState("");
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

    const authHeaders = useMemo(() => (
        adminToken ? { Authorization: `Bearer ${adminToken}` } : {}
    ), [adminToken]);

    const flash = (message) => {
        setNotice(message);
        setTimeout(() => setNotice(""), 3500);
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
        const data = await api("/api/blog/posts");
        setPosts(data.posts || []);
    };

    const loadForum = async () => {
        const [catData, threadData] = await Promise.all([
            api("/api/forum/categories"),
            api("/api/forum/threads"),
        ]);
        setCategories(catData.categories || []);
        setThreads(threadData.threads || []);
        if ((catData.categories || []).length && !threadForm.categorySlug) {
            setThreadForm((prev) => ({ ...prev, categorySlug: catData.categories[0].slug }));
        }
    };

    const loadAdmin = async () => {
        if (!adminToken) return;
        const [blogData, forumData, usersData, diseaseData] = await Promise.all([
            api("/api/blog/admin/posts", { headers: authHeaders }),
            api("/api/forum/admin/moderation", { headers: authHeaders }),
            api("/api/admin/users", { headers: authHeaders }),
            api("/api/admin/disease-reports", { headers: authHeaders }),
        ]);
        setAdminPosts(blogData.posts || []);
        setModeration({
            ...(forumData || { threads: [], replies: [], reports: [] }),
            users: usersData.users || [],
            diseaseReports: diseaseData.reports || [],
        });
    };

    useEffect(() => {
        loadBlog().catch((err) => flash(err.message));
        loadForum().catch((err) => flash(err.message));
    }, []);

    useEffect(() => {
        if (adminToken) localStorage.setItem("agrigrow_admin_token", adminToken);
        else localStorage.removeItem("agrigrow_admin_token");
    }, [adminToken]);

    const submitBlogPost = async (event) => {
        event.preventDefault();
        setLoading(true);
        try {
            await api("/api/blog/posts", {
                method: "POST",
                body: JSON.stringify(postForm),
            });
            setPostForm(emptyPost);
            flash("Post submitted. It is waiting for admin approval.");
            await loadAdmin().catch(() => {});
        } catch (err) {
            flash(err.message);
        } finally {
            setLoading(false);
        }
    };

    const openPost = async (slug) => {
        try {
            const data = await api(`/api/blog/posts/${slug}`);
            setSelectedPost(data.post);
        } catch (err) {
            flash(err.message);
        }
    };

    const moderatePost = async (id, status, rejectionReason = "") => {
        try {
            await api(`/api/blog/admin/posts/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ status, rejectionReason }),
            });
            flash(status === "approved" ? "Blog post approved." : "Blog post rejected.");
            await Promise.all([loadBlog(), loadAdmin()]);
        } catch (err) {
            flash(err.message);
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
            flash("Thread submitted. It is waiting for moderation.");
            await loadAdmin().catch(() => {});
        } catch (err) {
            flash(err.message);
        } finally {
            setLoading(false);
        }
    };

    const openThread = async (slug) => {
        try {
            const data = await api(`/api/forum/threads/${slug}`);
            setSelectedThread(data.thread);
            setReplies(data.replies || []);
        } catch (err) {
            flash(err.message);
        }
    };

    const submitReply = async (event) => {
        event.preventDefault();
        if (!selectedThread) return;
        try {
            await api(`/api/forum/threads/${selectedThread.slug}/replies`, {
                method: "POST",
                body: JSON.stringify({ body: replyBody }),
            });
            setReplyBody("");
            flash("Reply submitted. It will appear after moderation.");
            await loadAdmin().catch(() => {});
        } catch (err) {
            flash(err.message);
        }
    };

    const reportItem = async (targetType, targetId) => {
        try {
            await api("/api/forum/reports", {
                method: "POST",
                body: JSON.stringify({ targetType, targetId, reason: "other", details: "Reported from community page" }),
            });
            flash("Report sent to admin.");
        } catch (err) {
            flash(err.message);
        }
    };

    const moderateThread = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/threads/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Thread moderation updated.");
            await Promise.all([loadForum(), loadAdmin()]);
        } catch (err) {
            flash(err.message);
        }
    };

    const moderateReply = async (id, moderationStatus) => {
        try {
            await api(`/api/forum/admin/replies/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ moderationStatus }),
            });
            flash("Reply moderation updated.");
            await Promise.all([loadForum(), loadAdmin()]);
        } catch (err) {
            flash(err.message);
        }
    };

    const reviewReport = async (id, status = "reviewed") => {
        try {
            await api(`/api/forum/admin/reports/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ status }),
            });
            flash("Report reviewed.");
            await loadAdmin();
        } catch (err) {
            flash(err.message);
        }
    };

    const updateUserStatus = async (id, isActive) => {
        try {
            await api(`/api/admin/users/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ isActive }),
            });
            flash("User status updated.");
            await loadAdmin();
        } catch (err) {
            flash(err.message);
        }
    };

    const updateDiseaseReport = async (id, resolved) => {
        try {
            await api(`/api/admin/disease-reports/${id}`, {
                method: "PATCH",
                headers: authHeaders,
                body: JSON.stringify({ resolved }),
            });
            flash("Disease report updated.");
            await loadAdmin();
        } catch (err) {
            flash(err.message);
        }
    };

    const loadNotifications = async () => {
        try {
            const query = notificationEmail ? `?email=${encodeURIComponent(notificationEmail)}` : "";
            const data = await api(`/api/blog/notifications${query}`, { headers: authHeaders });
            setNotifications(data.notifications || []);
        } catch (err) {
            flash(err.message);
        }
    };

    const approveLabel = (item) => item.moderationStatus === "approved" ? "Approved" : "Approve";

    return (
        <div className="community-page">
            <header className="community-topbar">
                <button className="community-back" onClick={onBack}>Back</button>
                <div>
                    <h1>Community</h1>
                    <p>Blog posts, farmer discussions, approvals, reports, and updates.</p>
                </div>
                <div className="admin-token">
                    <label>Admin token</label>
                    <input
                        value={adminToken}
                        onChange={(e) => setAdminToken(e.target.value)}
                        placeholder="Paste admin JWT"
                    />
                    <button onClick={loadAdmin}>Load admin</button>
                </div>
            </header>

            <nav className="community-tabs">
                {["blog", "submit", "forum", "notifications", "admin"].map((name) => (
                    <button key={name} className={tab === name ? "active" : ""} onClick={() => setTab(name)}>
                        {name[0].toUpperCase() + name.slice(1)}
                    </button>
                ))}
            </nav>

            {notice && <div className="community-notice">{notice}</div>}

            {tab === "blog" && (
                <main className="community-grid">
                    <section className="community-panel wide">
                        <h2>Approved Blog Posts</h2>
                        <div className="post-grid">
                            {posts.map((post) => (
                                <article className="post-card" key={post._id} onClick={() => openPost(post.slug)}>
                                    {post.coverImage && <img src={post.coverImage} alt="" />}
                                    <span>{BLOG_CATEGORIES.find(([id]) => id === post.category)?.[1] || post.category}</span>
                                    <h3>{post.title}</h3>
                                    <p>{post.excerpt || post.content.slice(0, 140)}</p>
                                    <small>By {post.authorName} · {new Date(post.publishedAt || post.createdAt).toLocaleDateString()}</small>
                                </article>
                            ))}
                            {!posts.length && <p className="empty">No approved posts yet.</p>}
                        </div>
                    </section>
                    {selectedPost && (
                        <aside className="community-panel reader">
                            <button className="mini-btn" onClick={() => setSelectedPost(null)}>Close</button>
                            <h2>{selectedPost.title}</h2>
                            <p className="muted">By {selectedPost.authorName}</p>
                            <div className="reader-body">{selectedPost.content}</div>
                            <h3>Comments</h3>
                            {(selectedPost.comments || []).map((comment) => (
                                <div className="reply" key={comment._id}>
                                    <strong>{comment.authorName}</strong>
                                    <p>{comment.content}</p>
                                </div>
                            ))}
                        </aside>
                    )}
                </main>
            )}

            {tab === "submit" && (
                <main className="community-panel form-panel">
                    <h2>Submit a Blog Post</h2>
                    <form onSubmit={submitBlogPost} className="community-form">
                        <input required placeholder="Title" value={postForm.title} onChange={(e) => setPostForm({ ...postForm, title: e.target.value })} />
                        <div className="form-row">
                            <input placeholder="Your name" value={postForm.authorName} onChange={(e) => setPostForm({ ...postForm, authorName: e.target.value })} />
                            <input type="email" placeholder="Email for approval updates" value={postForm.submitterEmail} onChange={(e) => setPostForm({ ...postForm, submitterEmail: e.target.value })} />
                        </div>
                        <div className="form-row">
                            <select value={postForm.category} onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}>
                                {BLOG_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                            </select>
                            <input placeholder="Tags, comma separated" value={postForm.tags} onChange={(e) => setPostForm({ ...postForm, tags: e.target.value })} />
                        </div>
                        <input placeholder="Cover image URL" value={postForm.coverImage} onChange={(e) => setPostForm({ ...postForm, coverImage: e.target.value })} />
                        <textarea placeholder="Short excerpt" value={postForm.excerpt} onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })} />
                        <textarea required className="large" placeholder="Write the post..." value={postForm.content} onChange={(e) => setPostForm({ ...postForm, content: e.target.value })} />
                        <button disabled={loading}>Send for approval</button>
                    </form>
                </main>
            )}

            {tab === "forum" && (
                <main className="community-grid">
                    <section className="community-panel">
                        <h2>Start a Discussion</h2>
                        <form onSubmit={submitThread} className="community-form compact">
                            <input required placeholder="Question title" value={threadForm.title} onChange={(e) => setThreadForm({ ...threadForm, title: e.target.value })} />
                            <div className="form-row">
                                <input placeholder="Your name" value={threadForm.authorName} onChange={(e) => setThreadForm({ ...threadForm, authorName: e.target.value })} />
                                <select value={threadForm.categorySlug} onChange={(e) => setThreadForm({ ...threadForm, categorySlug: e.target.value })}>
                                    {categories.map((category) => <option key={category._id} value={category.slug}>{category.name}</option>)}
                                </select>
                            </div>
                            <textarea required placeholder="Describe the issue or question..." value={threadForm.body} onChange={(e) => setThreadForm({ ...threadForm, body: e.target.value })} />
                            <button disabled={loading}>Submit thread</button>
                        </form>
                    </section>
                    <section className="community-panel">
                        <h2>Forum Threads</h2>
                        <div className="thread-list">
                            {threads.map((thread) => (
                                <article key={thread._id} className="thread-card" onClick={() => openThread(thread.slug)}>
                                    <span style={{ borderColor: thread.category?.color }}>{thread.category?.name}</span>
                                    <h3>{thread.title}</h3>
                                    <p>{thread.body.slice(0, 120)}</p>
                                    <small>{thread.replyCount} replies · {thread.isSolved ? "Solved" : "Open"}</small>
                                </article>
                            ))}
                            {!threads.length && <p className="empty">No approved discussions yet.</p>}
                        </div>
                    </section>
                    {selectedThread && (
                        <section className="community-panel wide">
                            <button className="mini-btn" onClick={() => setSelectedThread(null)}>Close thread</button>
                            <h2>{selectedThread.title}</h2>
                            <p>{selectedThread.body}</p>
                            <button className="mini-btn" onClick={() => reportItem("forum-thread", selectedThread._id)}>Report thread</button>
                            <h3>Replies</h3>
                            {replies.map((reply) => (
                                <div className={`reply ${reply.isSolution ? "solution" : ""}`} key={reply._id}>
                                    <strong>{reply.authorName} {reply.isSolution ? "· Solution" : ""}</strong>
                                    <p>{reply.body}</p>
                                    <button className="mini-btn" onClick={() => reportItem("forum-reply", reply._id)}>Report</button>
                                </div>
                            ))}
                            <form onSubmit={submitReply} className="community-form compact">
                                <textarea required placeholder="Write a reply..." value={replyBody} onChange={(e) => setReplyBody(e.target.value)} />
                                <button>Submit reply</button>
                            </form>
                        </section>
                    )}
                </main>
            )}

            {tab === "notifications" && (
                <main className="community-panel form-panel">
                    <h2>Approval Notifications</h2>
                    <div className="form-row">
                        <input placeholder="Email used on submission" value={notificationEmail} onChange={(e) => setNotificationEmail(e.target.value)} />
                        <button onClick={loadNotifications}>Load notifications</button>
                    </div>
                    <div className="thread-list">
                        {notifications.map((note) => (
                            <article className="thread-card" key={note._id}>
                                <span>{note.type}</span>
                                <h3>{note.title}</h3>
                                <p>{note.message}</p>
                                <small>{new Date(note.createdAt).toLocaleString()}</small>
                            </article>
                        ))}
                        {!notifications.length && <p className="empty">No notifications loaded.</p>}
                    </div>
                </main>
            )}

            {tab === "admin" && (
                <main className="community-grid">
                    <section className="community-panel">
                        <h2>Blog Approval Queue</h2>
                        <button className="mini-btn" onClick={loadAdmin}>Refresh admin queues</button>
                        <div className="thread-list">
                            {adminPosts.map((post) => (
                                <article className="thread-card" key={post._id}>
                                    <span>{post.status}</span>
                                    <h3>{post.title}</h3>
                                    <p>{post.content.slice(0, 160)}</p>
                                    <div className="admin-actions">
                                        <button onClick={() => moderatePost(post._id, "approved")}>Approve</button>
                                        <button onClick={() => moderatePost(post._id, "rejected", "Please revise and resubmit.")}>Reject</button>
                                    </div>
                                </article>
                            ))}
                            {!adminPosts.length && <p className="empty">No blog posts loaded.</p>}
                        </div>
                    </section>
                    <section className="community-panel">
                        <h2>Forum Moderation</h2>
                        <h3>Threads</h3>
                        {(moderation.threads || []).map((thread) => (
                            <article className="thread-card" key={thread._id}>
                                <span>{thread.moderationStatus}</span>
                                <h3>{thread.title}</h3>
                                <p>{thread.body.slice(0, 120)}</p>
                                <div className="admin-actions">
                                    <button onClick={() => moderateThread(thread._id, "approved")}>{approveLabel(thread)}</button>
                                    <button onClick={() => moderateThread(thread._id, "hidden")}>Hide</button>
                                    <button onClick={() => moderateThread(thread._id, "rejected")}>Reject</button>
                                </div>
                            </article>
                        ))}
                        <h3>Replies</h3>
                        {(moderation.replies || []).map((reply) => (
                            <article className="thread-card" key={reply._id}>
                                <span>{reply.moderationStatus}</span>
                                <p>{reply.body}</p>
                                <div className="admin-actions">
                                    <button onClick={() => moderateReply(reply._id, "approved")}>{approveLabel(reply)}</button>
                                    <button onClick={() => moderateReply(reply._id, "hidden")}>Hide</button>
                                    <button onClick={() => moderateReply(reply._id, "rejected")}>Reject</button>
                                </div>
                            </article>
                        ))}
                        <h3>Reports</h3>
                        {(moderation.reports || []).map((report) => (
                            <article className="thread-card" key={report._id}>
                                <span>{report.targetType}</span>
                                <p>{report.reason}: {report.details || "No details"}</p>
                                <div className="admin-actions">
                                    <button onClick={() => reviewReport(report._id, "reviewed")}>Mark reviewed</button>
                                    <button onClick={() => reviewReport(report._id, "dismissed")}>Dismiss</button>
                                </div>
                            </article>
                        ))}
                        <h3>Users</h3>
                        {(moderation.users || []).map((user) => (
                            <article className="thread-card" key={user._id}>
                                <span>{user.role}</span>
                                <h3>{user.name}</h3>
                                <p>{user.email}</p>
                                <small>{user.isActive ? "Active" : "Inactive"}</small>
                                <div className="admin-actions">
                                    <button onClick={() => updateUserStatus(user._id, !user.isActive)}>
                                        {user.isActive ? "Deactivate" : "Activate"}
                                    </button>
                                </div>
                            </article>
                        ))}
                        <h3>Disease Reports</h3>
                        {(moderation.diseaseReports || []).map((report) => (
                            <article className="thread-card" key={report._id}>
                                <span>{report.prediction?.isHealthy ? "Healthy" : "Disease"}</span>
                                <h3>{report.prediction?.disease || "Unknown"}</h3>
                                <p>
                                    Confidence: {Number(report.prediction?.confidence || 0).toFixed(1)}%
                                    {report.user?.email ? ` · ${report.user.email}` : ""}
                                </p>
                                <small>{report.resolved ? "Resolved" : "Open"}</small>
                                <div className="admin-actions">
                                    <button onClick={() => updateDiseaseReport(report._id, !report.resolved)}>
                                        {report.resolved ? "Mark open" : "Mark resolved"}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>
                </main>
            )}
        </div>
    );
}

export default Community;
