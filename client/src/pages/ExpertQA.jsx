import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import BookmarkButton from "../components/BookmarkButton";
import "./ExpertQA.css";

export default function ExpertQA() {
    const { authHeaders, isAuthenticated, user } = useAuth();
    const { t } = useLanguage();
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeQuestion, setActiveQuestion] = useState(null);
    const [activeQuestionLoading, setActiveQuestionLoading] = useState(false);

    // Filter/Sort State
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("all");
    const [sort, setSort] = useState("recent");
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Ask Question Form State
    const [askOpen, setAskOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [askCategory, setAskCategory] = useState("disease");
    const [cropName, setCropName] = useState("");
    const [province, setProvince] = useState("Punjab");
    const [district, setDistrict] = useState("");
    const [isUrgent, setIsUrgent] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Answer Input State
    const [replyBody, setReplyBody] = useState("");
    const [submittingAnswer, setSubmittingAnswer] = useState(false);

    const fetchQuestions = async () => {
        setLoading(true);
        try {
            let url = `/api/questions?page=${page}&sort=${sort}&limit=8`;
            if (category !== "all") url += `&category=${category}`;
            if (search) url += `&search=${encodeURIComponent(search)}`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setQuestions(data.data.questions || []);
                setTotalPages(data.data.pages || 1);
            }
        } catch (err) {
            console.error("Failed to fetch questions:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchQuestionDetail = async (id) => {
        setActiveQuestionLoading(true);
        try {
            const res = await fetch(`/api/questions/${id}`);
            if (res.ok) {
                const data = await res.json();
                setActiveQuestion(data.data || data);
            }
        } catch (err) {
            console.error("Failed to fetch question detail:", err);
        } finally {
            setActiveQuestionLoading(false);
        }
    };

    useEffect(() => {
        fetchQuestions();
    }, [page, sort, category, search]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleAskSubmit = async (e) => {
        e.preventDefault();
        if (!title || !body) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/questions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({
                    title,
                    body,
                    category: askCategory,
                    cropName,
                    province,
                    district,
                    isUrgent
                })
            });

            if (res.ok) {
                setTitle("");
                setBody("");
                setCropName("");
                setDistrict("");
                setIsUrgent(false);
                setAskOpen(false);
                fetchQuestions();
            }
        } catch (err) {
            console.error("Failed to submit question:", err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleAnswerSubmit = async (e) => {
        e.preventDefault();
        if (!replyBody || !activeQuestion) return;
        setSubmittingAnswer(true);

        try {
            const res = await fetch(`/api/questions/${activeQuestion._id}/answers`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({ body: replyBody })
            });

            if (res.ok) {
                setReplyBody("");
                fetchQuestionDetail(activeQuestion._id);
                fetchQuestions();
            }
        } catch (err) {
            console.error("Failed to post answer:", err);
        } finally {
            setSubmittingAnswer(false);
        }
    };

    const handleUpvoteQuestion = async (id, e) => {
        e.stopPropagation();
        if (!isAuthenticated) return;
        try {
            const res = await fetch(`/api/questions/${id}/upvote`, {
                method: "POST",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                if (activeQuestion && activeQuestion._id === id) {
                    fetchQuestionDetail(id);
                }
                fetchQuestions();
            }
        } catch (err) {
            console.error("Upvote question failed:", err);
        }
    };

    const handleUpvoteAnswer = async (answerId) => {
        if (!isAuthenticated || !activeQuestion) return;
        try {
            const res = await fetch(`/api/questions/${activeQuestion._id}/answers/${answerId}/upvote`, {
                method: "POST",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                fetchQuestionDetail(activeQuestion._id);
            }
        } catch (err) {
            console.error("Upvote answer failed:", err);
        }
    };

    const handleAcceptAnswer = async (answerId) => {
        if (!isAuthenticated || !activeQuestion) return;
        try {
            const res = await fetch(`/api/questions/${activeQuestion._id}/answers/${answerId}/accept`, {
                method: "PATCH",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                fetchQuestionDetail(activeQuestion._id);
            }
        } catch (err) {
            console.error("Failed to accept answer:", err);
        }
    };

    return (
        <div className="qa-page">
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
            </div>

            <div className="qa-content container">
                <div className="qa-header">
                    <div>
                        <h2>{t("qa.title")}</h2>
                        <p className="text-dim">Get immediate answers from AI or consult with community farmers</p>
                    </div>
                    {isAuthenticated && (
                        <button onClick={() => setAskOpen(true)} className="btn-primary ask-btn">
                            🙋 {t("qa.askQuestion")}
                        </button>
                    )}
                </div>

                {/* Ask Question Overlay Modal */}
                {askOpen && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: "rgba(3, 7, 18, 0.8)", backdropFilter: "blur(8px)",
                        zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center",
                        padding: "16px"
                    }}>
                        <div className="glass-panel" style={{ width: "100%", maxWidth: "550px", padding: "24px" }}>
                            <h3 style={{ fontSize: "18px", color: "white", marginBottom: "16px" }}>{t("qa.askQuestion")}</h3>
                            
                            <form onSubmit={handleAskSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div className="form-group">
                                    <label>Question Title</label>
                                    <input
                                        type="text" required placeholder="e.g. Tomato leaves turning yellow with brown spots"
                                        value={title} onChange={(e) => setTitle(e.target.value)}
                                        style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                    />
                                </div>
                                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <div className="form-group">
                                        <label>Category</label>
                                        <select value={askCategory} onChange={(e) => setAskCategory(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                            <option value="disease">Crop Disease</option>
                                            <option value="crop-planning">Planning</option>
                                            <option value="soil">Soil Care</option>
                                            <option value="irrigation">Watering</option>
                                            <option value="market">Market Rates</option>
                                            <option value="other">General</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Affected Crop</label>
                                        <input
                                            type="text" placeholder="e.g. Wheat" value={cropName}
                                            onChange={(e) => setCropName(e.target.value)}
                                            style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                        />
                                    </div>
                                </div>
                                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <div className="form-group">
                                        <label>Province</label>
                                        <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                            <option value="Punjab">Punjab</option>
                                            <option value="Sindh">Sindh</option>
                                            <option value="KPK">KPK</option>
                                            <option value="Balochistan">Balochistan</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>District</label>
                                        <input
                                            type="text" placeholder="e.g. Faisalabad" value={district}
                                            onChange={(e) => setDistrict(e.target.value)}
                                            style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label>Detailed Explanation</label>
                                    <textarea
                                        rows="4" required placeholder="Describe symptoms, soil condition, or query details..."
                                        value={body} onChange={(e) => setBody(e.target.value)}
                                        style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white", resize: "none" }}
                                    />
                                </div>
                                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                    <input type="checkbox" id="urgent" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
                                    <label htmlFor="urgent" style={{ fontSize: "13px", color: "#f8fafc" }}>🚨 Mark as Urgent</label>
                                </div>
                                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                                    <button type="button" onClick={() => setAskOpen(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer" }}>Cancel</button>
                                    <button type="submit" disabled={submitting} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#10b981", color: "#030712", fontWeight: 600, cursor: "pointer" }}>
                                        {submitting ? "Analyzing Query..." : "Submit Question"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                <div className="qa-main-grid">
                    {/* Left: Questions List & Filters */}
                    <div className="qa-left-panel">
                        {/* Search and Filters */}
                        <div className="filters-card glass-panel" style={{ padding: "16px 20px", marginBottom: "20px" }}>
                            <div className="search-box-row" style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                                <input
                                    type="text" placeholder="Search questions..." value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    style={{ flex: 1, padding: "8px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                />
                                <select value={sort} onChange={(e) => setSort(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                    <option value="recent">Recent</option>
                                    <option value="popular">Popular</option>
                                    <option value="unanswered">Unanswered</option>
                                </select>
                            </div>
                            <div className="category-tabs" style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
                                <button onClick={() => setCategory("all")} className={`tag-btn ${category === "all" ? "active" : ""}`}>All</button>
                                <button onClick={() => setCategory("disease")} className={`tag-btn ${category === "disease" ? "active" : ""}`}>Disease</button>
                                <button onClick={() => setCategory("crop-planning")} className={`tag-btn ${category === "crop-planning" ? "active" : ""}`}>Planning</button>
                                <button onClick={() => setCategory("soil")} className={`tag-btn ${category === "soil" ? "active" : ""}`}>Soil</button>
                                <button onClick={() => setCategory("irrigation")} className={`tag-btn ${category === "irrigation" ? "active" : ""}`}>Watering</button>
                            </div>
                        </div>

                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner" />
                                <p>Loading consultation questions...</p>
                            </div>
                        ) : questions.length === 0 ? (
                            <div className="empty-state glass-panel">
                                <div className="empty-icon">❓</div>
                                <h3>{t("qa.noQuestions")}</h3>
                                <p>Be the first to submit a agricultural query.</p>
                            </div>
                        ) : (
                            <div className="questions-list">
                                {questions.map(q => (
                                    <div
                                        key={q._id}
                                        onClick={() => fetchQuestionDetail(q._id)}
                                        className={`q-card glass-panel ${activeQuestion && activeQuestion._id === q._id ? "active-border" : ""}`}
                                    >
                                        <div className="q-card-vote">
                                            <button onClick={(e) => handleUpvoteQuestion(q._id, e)} className="vote-btn">
                                                👍
                                            </button>
                                            <span>{q.upvotesCount}</span>
                                        </div>
                                        <div className="q-card-body">
                                            <div className="q-card-meta">
                                                <span className="q-category">{q.category}</span>
                                                {q.isUrgent && <span className="urgent-badge">🚨 URGENT</span>}
                                                <span className="q-date">{new Date(q.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <h4 className="q-title">{q.title}</h4>
                                            <p className="q-author">By: <strong>{q.user?.name || "Anonymous Farmer"}</strong></p>
                                            <div className="q-footer-stats">
                                                <span>💬 {q.answersCount} answers</span>
                                                <span>👁️ {q.viewCount} views</span>
                                                <BookmarkButton type="question" itemId={q._id} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="pagination" style={{ display: "flex", gap: "10px", justifyContent: "center", marginTop: "20px" }}>
                                <button disabled={page === 1} onClick={() => setPage(prev => prev - 1)} className="btn-read">Prev</button>
                                <span style={{ display: "flex", alignItems: "center", color: "#94a3b8" }}>Page {page} of {totalPages}</span>
                                <button disabled={page === totalPages} onClick={() => setPage(prev => prev + 1)} className="btn-read">Next</button>
                            </div>
                        )}
                    </div>

                    {/* Right: Question details & Answers */}
                    <div className="qa-right-panel">
                        {activeQuestionLoading ? (
                            <div className="loading-state glass-panel">
                                <div className="spinner" />
                                <p>Loading query details...</p>
                            </div>
                        ) : !activeQuestion ? (
                            <div className="select-prompt glass-panel">
                                <span style={{ fontSize: "36px" }}>🔍</span>
                                <h3>Select a Question</h3>
                                <p>Click on any question card in the left list to view diagnostic details, AI response, and farmer replies.</p>
                            </div>
                        ) : (
                            <div className="question-detail-view glass-panel">
                                <div className="q-detail-header">
                                    <span className="q-category-tag">{activeQuestion.category}</span>
                                    {activeQuestion.isUrgent && <span className="urgent-banner">🚨 URGENT CALL FOR ADVICE</span>}
                                    <h2>{activeQuestion.title}</h2>
                                    <div className="q-detail-meta">
                                        <span>Asked by: <strong>{activeQuestion.user?.name || "Farmer"}</strong></span>
                                        <span>•</span>
                                        <span>{new Date(activeQuestion.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>

                                <div className="q-detail-body">
                                    <p className="q-body-text">{activeQuestion.body}</p>
                                    
                                    {(activeQuestion.location?.province || activeQuestion.cropName) && (
                                        <div className="q-detail-context">
                                            {activeQuestion.cropName && <span>🌾 Crop: <strong>{activeQuestion.cropName}</strong></span>}
                                            {activeQuestion.location?.province && <span>📍 Mandi Area: {activeQuestion.location.district}, {activeQuestion.location.province}</span>}
                                        </div>
                                    )}
                                </div>

                                {/* AI Expert Response section */}
                                {activeQuestion.aiAnswer && (
                                    <div className="ai-response-box">
                                        <div className="ai-response-header">
                                            <span className="ai-bot-icon">🤖</span>
                                            <h3>{t("qa.aiResponse")}</h3>
                                            <span className="ai-expert-badge">AgriGrow Expert AI</span>
                                        </div>
                                        <div className="ai-response-text">
                                            {activeQuestion.aiAnswer}
                                        </div>
                                    </div>
                                )}

                                {/* Replies/Answers List */}
                                <div className="answers-section">
                                    <h3>{t("qa.communityAnswers")} ({activeQuestion.answers?.length || 0})</h3>
                                    
                                    {(!activeQuestion.answers || activeQuestion.answers.length === 0) ? (
                                        <p className="no-answers-msg">No community answers posted yet. Help this farmer by writing a response below!</p>
                                    ) : (
                                        <div className="answers-list">
                                            {activeQuestion.answers.map(ans => (
                                                <div key={ans._id} className={`answer-item ${ans.isAccepted ? "accepted-item" : ""}`}>
                                                    <div className="answer-item-header">
                                                        <div className="ans-author-meta">
                                                            <strong>{ans.authorName}</strong>
                                                            {ans.isExpert && <span className="expert-star-badge">🌟 regional expert</span>}
                                                        </div>
                                                        <div className="ans-header-actions">
                                                            <button onClick={() => handleUpvoteAnswer(ans._id)} className="ans-upvote-btn">
                                                                👍 {ans.upvotes?.length || 0}
                                                            </button>
                                                            {isAuthenticated && user && activeQuestion.user?._id === user.id && !ans.isAccepted && (
                                                                <button onClick={() => handleAcceptAnswer(ans._id)} className="accept-action-btn">
                                                                    ✓ Accept Answer
                                                                </button>
                                                            )}
                                                            {ans.isAccepted && <span className="accepted-check-badge">✓ Accepted Solution</span>}
                                                        </div>
                                                    </div>
                                                    <p className="answer-item-text">{ans.body}</p>
                                                    <span className="answer-date">{new Date(ans.createdAt).toLocaleDateString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add Answer form */}
                                    {isAuthenticated ? (
                                        <form onSubmit={handleAnswerSubmit} className="reply-form">
                                            <textarea
                                                rows="3" required placeholder={t("qa.answerQuestion")}
                                                value={replyBody} onChange={(e) => setReplyBody(e.target.value)}
                                            />
                                            <button type="submit" disabled={submittingAnswer} className="btn-primary submit-reply-btn">
                                                {submittingAnswer ? "Posting..." : "Post Answer"}
                                            </button>
                                        </form>
                                    ) : (
                                        <p className="login-to-reply-prompt">Please log in to write a consultation reply.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
