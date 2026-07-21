import { useState } from "react";
import { useLanguage } from "../context/LanguageContext";

export default function EventModal({ isOpen, onClose, onSave, event, fields }) {
    const { t } = useLanguage();
    const [title, setTitle] = useState(event ? event.title : "");
    const [eventType, setEventType] = useState(event ? event.eventType : "watering");
    const [startDate, setStartDate] = useState(
        event ? new Date(event.startDate).toISOString().substring(0, 16) : new Date().toISOString().substring(0, 16)
    );
    const [description, setDescription] = useState(event ? event.description || "" : "");
    const [fieldId, setFieldId] = useState(event ? event.field || "" : "");
    const [cropName, setCropName] = useState(event ? event.cropName || "" : "");
    const [priority, setPriority] = useState(event ? event.priority || "medium" : "medium");

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave({
            title,
            eventType,
            startDate: new Date(startDate).toISOString(),
            description,
            field: fieldId || null,
            cropName,
            priority
        });
    };

    return (
        <div style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(3, 7, 18, 0.8)", backdropFilter: "blur(8px)",
            zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center",
            padding: "16px"
        }}>
            <div className="glass-panel" style={{
                width: "100%", maxWidth: "500px", padding: "24px",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 20px 40px rgba(0,0,0,0.6)"
            }}>
                <h3 style={{
                    fontSize: "20px", fontWeight: 600, marginBottom: "16px",
                    fontFamily: "'Outfit', sans-serif", color: "#f8fafc"
                }}>
                    {event ? t("calendar.editEvent", "Edit Event") : t("calendar.addEvent", "Add Event")}
                </h3>
                
                <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("common.title", "Title")}</label>
                        <input
                            type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
                            style={{
                                padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                            }}
                        />
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("common.type", "Type")}</label>
                            <select
                                value={eventType} onChange={(e) => setEventType(e.target.value)}
                                style={{
                                    padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                    border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                                }}
                            >
                                <option value="watering">💧 {t("calendar.watering")}</option>
                                <option value="fertilizer">🧪 {t("calendar.fertilizer")}</option>
                                <option value="pesticide">🐛 {t("calendar.pesticide")}</option>
                                <option value="harvest">🌾 {t("calendar.harvest")}</option>
                                <option value="sowing">🌱 {t("calendar.sowing")}</option>
                                <option value="soil-prep">🚜 Soil Prep</option>
                                <option value="pruning">✂️ Pruning</option>
                                <option value="inspection">🔍 Inspection</option>
                                <option value="other">📝 Other</option>
                            </select>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("common.priority", "Priority")}</label>
                            <select
                                value={priority} onChange={(e) => setPriority(e.target.value)}
                                style={{
                                    padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                    border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                                }}
                            >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("calendar.crop", "Crop")}</label>
                            <input
                                type="text" value={cropName} onChange={(e) => setCropName(e.target.value)}
                                placeholder="e.g. Wheat"
                                style={{
                                    padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                    border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                                }}
                            />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("dashboard.fieldsTab", "Field")}</label>
                            <select
                                value={fieldId} onChange={(e) => setFieldId(e.target.value)}
                                style={{
                                    padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                    border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                                }}
                            >
                                <option value="">-- None --</option>
                                {fields.map(f => (
                                    <option key={f._id} value={f._id}>{f.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("common.date", "Date & Time")}</label>
                        <input
                            type="datetime-local" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                            style={{
                                padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none"
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={{ fontSize: "13px", color: "#94a3b8" }}>{t("common.description", "Description")}</label>
                        <textarea
                            rows="3" value={description} onChange={(e) => setDescription(e.target.value)}
                            style={{
                                padding: "10px", borderRadius: "10px", background: "rgba(15,23,42,0.6)",
                                border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", outline: "none", resize: "none"
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "8px" }}>
                        <button
                            type="button" onClick={onClose}
                            style={{
                                padding: "10px 16px", borderRadius: "10px", background: "rgba(255,255,255,0.05)",
                                border: "1px solid rgba(255,255,255,0.08)", color: "#f8fafc", cursor: "pointer"
                            }}
                        >
                            {t("common.cancel")}
                        </button>
                        <button
                            type="submit"
                            style={{
                                padding: "10px 20px", borderRadius: "10px", background: "linear-gradient(135deg, #10b981 0%, #0ea5e9 100%)",
                                border: "none", color: "#f8fafc", cursor: "pointer", fontWeight: 600
                            }}
                        >
                            {t("common.save")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
