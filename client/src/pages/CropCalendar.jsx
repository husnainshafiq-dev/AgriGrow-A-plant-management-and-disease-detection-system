import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import EventModal from "../components/EventModal";
import "./CropCalendar.css";

export default function CropCalendar() {
    const { authHeaders } = useAuth();
    const { t } = useLanguage();
    const [events, setEvents] = useState([]);
    const [fields, setFields] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [activeEvent, setActiveEvent] = useState(null);
    const [filterType, setFilterType] = useState("all");
    const [viewMode, setViewMode] = useState("list"); // 'list' or 'grid'

    // AI schedule generator fields
    const [aiCropName, setAiCropName] = useState("");
    const [aiPlantingDate, setAiPlantingDate] = useState("");
    const [aiFieldId, setAiFieldId] = useState("");
    const [generatingAI, setGeneratingAI] = useState(false);
    const [aiMessage, setAiMessage] = useState("");
    const [aiSuggestions, setAiSuggestions] = useState(null);

    const fetchEvents = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/calendar", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setEvents(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch calendar events:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchFields = async () => {
        try {
            const res = await fetch("/api/dashboard/fields", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setFields(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch fields for calendar:", err);
        }
    };

    useEffect(() => {
        fetchEvents();
        fetchFields();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSaveEvent = async (eventData) => {
        try {
            const url = activeEvent ? `/api/calendar/${activeEvent._id}` : "/api/calendar";
            const method = activeEvent ? "PUT" : "POST";
            
            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify(eventData)
            });

            if (res.ok) {
                setModalOpen(false);
                setActiveEvent(null);
                fetchEvents();
            }
        } catch (err) {
            console.error("Failed to save calendar event:", err);
        }
    };

    const handleDeleteEvent = async (id) => {
        if (!window.confirm("Are you sure you want to delete this event?")) return;
        try {
            const res = await fetch(`/api/calendar/${id}`, {
                method: "DELETE",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                setEvents(prev => prev.filter(e => e._id !== id));
            }
        } catch (err) {
            console.error("Failed to delete event:", err);
        }
    };

    const handleToggleComplete = async (id, currentStatus) => {
        try {
            const res = await fetch(`/api/calendar/${id}/complete`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({ isCompleted: !currentStatus })
            });
            if (res.ok) {
                setEvents(prev => prev.map(e => e._id === id ? { ...e, isCompleted: !currentStatus } : e));
            }
        } catch (err) {
            console.error("Failed to toggle completion:", err);
        }
    };

    // AI calendar schedule generator
    const handleGenerateAISchedule = async (e) => {
        e.preventDefault();
        if (!aiCropName || !aiPlantingDate) return;
        setGeneratingAI(true);
        setAiMessage("");
        setAiSuggestions(null);

        try {
            const res = await fetch("/api/calendar/generate", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({
                    cropName: aiCropName,
                    plantingDate: aiPlantingDate,
                    fieldId: aiFieldId || null
                })
            });

            const data = await res.json();
            if (res.ok) {
                setAiSuggestions(data.data || []);
                setAiMessage(`AI successfully designed a schedule for ${aiCropName}! Review and add them to your calendar.`);
            } else {
                setAiMessage(data.error || "AI scheduling failed.");
            }
        } catch (err) {
            console.error("Failed to generate AI schedule:", err);
            setAiMessage("Network error during AI execution.");
        } finally {
            setGeneratingAI(false);
        }
    };

    const handleAddAISuggestion = async (suggestion) => {
        try {
            const res = await fetch("/api/calendar", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify(suggestion)
            });

            if (res.ok) {
                // Remove from local suggestion list
                setAiSuggestions(prev => prev.filter(s => s !== suggestion));
                fetchEvents();
            }
        } catch (err) {
            console.error("Failed to add AI suggestion:", err);
        }
    };

    const handleAddAllAISuggestions = async () => {
        if (!aiSuggestions || aiSuggestions.length === 0) return;
        const total = aiSuggestions.length;
        let successCount = 0;

        for (const sugg of aiSuggestions) {
            try {
                const res = await fetch("/api/calendar", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...authHeaders()
                    },
                    credentials: "include",
                    body: JSON.stringify(sugg)
                });
                if (res.ok) successCount++;
            } catch (err) {
                console.error("Batch add suggestion failed:", err);
            }
        }

        setAiSuggestions(null);
        setAiMessage(`Successfully saved ${successCount} of ${total} events to your crop calendar.`);
        fetchEvents();
        setTimeout(() => setAiMessage(""), 5000);
    };

    const getEventBadgeEmoji = (type) => {
        switch (type) {
            case "watering": return "💧";
            case "fertilizer": return "🧪";
            case "pesticide": return "🐛";
            case "harvest": return "🌾";
            case "sowing": return "🌱";
            case "soil-prep": return "🚜";
            case "pruning": return "✂️";
            case "inspection": return "🔍";
            default: return "📝";
        }
    };

    const filteredEvents = events.filter(e => {
        if (filterType === "all") return true;
        return e.eventType === filterType;
    });

    return (
        <div className="calendar-page">
            <div className="bg-blobs">
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="calendar-content container">
                <div className="calendar-header">
                    <div>
                        <h2>{t("calendar.title")}</h2>
                        <p className="text-dim">Watering, fertilizers, spraying, and harvest scheduling</p>
                    </div>
                    <button
                        onClick={() => {
                            setActiveEvent(null);
                            setModalOpen(true);
                        }}
                        className="btn-primary add-event-btn"
                    >
                        ➕ Add Manual Task
                    </button>
                </div>

                <div className="calendar-main-grid">
                    {/* Left: Events & Filters */}
                    <div className="calendar-left-panel">
                        {/* Filters */}
                        <div className="filters-card glass-panel">
                            <h4>Filter Tasks</h4>
                            <div className="filter-buttons">
                                <button onClick={() => setFilterType("all")} className={filterType === "all" ? "active" : ""}>All</button>
                                <button onClick={() => setFilterType("watering")} className={filterType === "watering" ? "active" : ""}>💧 Watering</button>
                                <button onClick={() => setFilterType("fertilizer")} className={filterType === "fertilizer" ? "active" : ""}>🧪 Fertilizer</button>
                                <button onClick={() => setFilterType("pesticide")} className={filterType === "pesticide" ? "active" : ""}>🐛 Pesticide</button>
                                <button onClick={() => setFilterType("harvest")} className={filterType === "harvest" ? "active" : ""}>🌾 Harvest</button>
                                <button onClick={() => setFilterType("sowing")} className={filterType === "sowing" ? "active" : ""}>🌱 Sowing</button>
                            </div>
                        </div>

                        {/* List view */}
                        {loading ? (
                            <div className="loading-state">
                                <div className="spinner" />
                                <p>Loading calendar tasks...</p>
                            </div>
                        ) : filteredEvents.length === 0 ? (
                            <div className="empty-state glass-panel">
                                <div className="empty-icon">📅</div>
                                <h3>No tasks scheduled</h3>
                                <p>Click "Add Manual Task" or use the AI Generator on the right to populate your calendar.</p>
                            </div>
                        ) : (
                            <div className="events-list">
                                {filteredEvents.map(evt => (
                                    <div key={evt._id} className={`event-card glass-panel ${evt.isCompleted ? "completed" : ""}`}>
                                        <div className="event-check">
                                            <input
                                                type="checkbox"
                                                checked={evt.isCompleted}
                                                onChange={() => handleToggleComplete(evt._id, evt.isCompleted)}
                                                id={`check-${evt._id}`}
                                            />
                                        </div>
                                        <div className="event-info">
                                            <div className="event-meta">
                                                <span className="event-type-badge">
                                                    {getEventBadgeEmoji(evt.eventType)} {evt.eventType}
                                                </span>
                                                <span className="event-date">
                                                    📅 {new Date(evt.startDate).toLocaleDateString(undefined, {
                                                        weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                                                    })}
                                                </span>
                                            </div>
                                            <h4 className="event-title">{evt.title}</h4>
                                            {evt.cropName && <p className="event-crop">🌾 Crop: <strong>{evt.cropName}</strong></p>}
                                            {evt.description && <p className="event-desc">{evt.description}</p>}
                                            {evt.field && <span className="event-field-badge">📍 {evt.field.name}</span>}
                                        </div>
                                        <div className="event-actions">
                                            <button
                                                onClick={() => {
                                                    setActiveEvent(evt);
                                                    setModalOpen(true);
                                                }}
                                                className="edit-btn"
                                            >
                                                ✏️
                                            </button>
                                            <button onClick={() => handleDeleteEvent(evt._id)} className="delete-btn">
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right: AI Crop Care Schedule Generator */}
                    <div className="calendar-right-panel">
                        <div className="ai-generator-card glass-panel">
                            <h3 className="ai-card-title">🤖 AI Smart Schedule Generator</h3>
                            <p className="ai-card-subtitle">Provide your planting details, and our agricultural model will design a complete care routine for fertilizer, irrigation, and harvest.</p>

                            <form onSubmit={handleGenerateAISchedule} className="ai-form">
                                <div className="form-group">
                                    <label>Crop Name</label>
                                    <input
                                        type="text" required placeholder="e.g. Wheat, Cotton, Basmati Rice"
                                        value={aiCropName} onChange={(e) => setAiCropName(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Planting / Sowing Date</label>
                                    <input
                                        type="date" required value={aiPlantingDate}
                                        onChange={(e) => setAiPlantingDate(e.target.value)}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Associate Field (Optional)</label>
                                    <select value={aiFieldId} onChange={(e) => setAiFieldId(e.target.value)}>
                                        <option value="">-- No Field --</option>
                                        {fields.map(f => (
                                            <option key={f._id} value={f._id}>{f.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <button type="submit" disabled={generatingAI} className="btn-primary ai-submit-btn">
                                    {generatingAI ? "Calculating Routine..." : "Generate AI Routine"}
                                </button>
                            </form>

                            {aiMessage && <p className="ai-status-msg">{aiMessage}</p>}

                            {aiSuggestions && aiSuggestions.length > 0 && (
                                <div className="ai-suggestions-list">
                                    <div className="ai-suggestions-header">
                                        <h4>AI Proposed Events ({aiSuggestions.length})</h4>
                                        <button onClick={handleAddAllAISuggestions} className="add-all-btn">
                                            Save All
                                        </button>
                                    </div>
                                    {aiSuggestions.map((sug, i) => (
                                        <div key={i} className="suggestion-item">
                                            <div className="sugg-left">
                                                <h5>{sug.title}</h5>
                                                <span>📅 Day {sug.daysAfterPlanting} ({new Date(sug.startDate).toLocaleDateString()})</span>
                                                <p>{sug.description}</p>
                                            </div>
                                            <button onClick={() => handleAddAISuggestion(sug)} className="add-sugg-btn">
                                                ＋
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <EventModal
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    setActiveEvent(null);
                }}
                onSave={handleSaveEvent}
                event={activeEvent}
                fields={fields}
            />
        </div>
    );
}
