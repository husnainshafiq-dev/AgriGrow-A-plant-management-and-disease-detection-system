import { useEffect, useState } from "react";
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
    const [notice, setNotice] = useState("");
    const [posts, setPosts] = useState([]);
    const [selectedPost, setSelectedPost] = useState(null);
    const [postForm, setPostForm] = useState(emptyPost);
    const [categories, setCategories] = useState([]);
    const [threads, setThreads] = useState([]);
    const [selectedThread, setSelectedThread] = useState(null);
    const [replies, setReplies] = useState([]);
    const [threadForm, setThreadForm] = useState(emptyThread);
    const [replyBody, setReplyBody] = useState("");
    const [notificationEmail, setNotificationEmail] = useState("");
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(false);

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

    useEffect(() => {
        loadBlog().catch((err) => flash(err.message));
        loadForum().catch((err) => flash(err.message));
    }, []);

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

    const loadNotifications = async () => {
        try {
            const query = notificationEmail ? `?email=${encodeURIComponent(notificationEmail)}` : "";
            const data = await api(`/api/blog/notifications${query}`);
            setNotifications(data.notifications || []);
        } catch (err) {
            flash(err.message);
        }
    };

    return (
        <div className="community-page">
            <header className="community-topbar">
                <button className="community-back" onClick={onBack}>Back</button>
                <div>
                    <h1>Community</h1>
                    <p>Blog posts, farmer discussions, and notifications.</p>
                </div>
            </header>

            <nav className="community-tabs">
                {["blog", "submit", "forum", "notifications"].map((name) => (
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

        </div>
    );
}

export default Community;
