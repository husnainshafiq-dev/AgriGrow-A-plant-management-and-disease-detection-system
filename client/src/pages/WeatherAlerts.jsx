import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import "./WeatherAlerts.css";

export default function WeatherAlerts() {
    const { authHeaders } = useAuth();
    const { t } = useLanguage();
    const [alerts, setAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [checking, setChecking] = useState(false);
    const [message, setMessage] = useState("");

    const fetchAlerts = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/weather/alerts", {
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setAlerts(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch weather alerts:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAlerts();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCheckAlerts = async () => {
        setChecking(true);
        setMessage("");
        try {
            const res = await fetch("/api/weather/alerts/check", {
                method: "POST",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setMessage(data.message || "Alerts checked successfully");
                fetchAlerts();
            } else {
                setMessage("Failed to scan fields for alerts.");
            }
        } catch (err) {
            console.error("Failed to trigger alert check:", err);
            setMessage("Network error. Try again.");
        } finally {
            setChecking(false);
            setTimeout(() => setMessage(""), 4000);
        }
    };

    const handleDismiss = async (id) => {
        try {
            const res = await fetch(`/api/weather/alerts/${id}/dismiss`, {
                method: "PATCH",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                setAlerts(prev => prev.filter(alert => alert._id !== id));
            }
        } catch (err) {
            console.error("Failed to dismiss alert:", err);
        }
    };

    const handleMarkRead = async (id) => {
        try {
            const res = await fetch(`/api/weather/alerts/${id}/read`, {
                method: "PATCH",
                headers: authHeaders(),
                credentials: "include"
            });
            if (res.ok) {
                setAlerts(prev => prev.map(alert => alert._id === id ? { ...alert, isRead: true } : alert));
            }
        } catch (err) {
            console.error("Failed to mark read:", err);
        }
    };

    const getSeverityColor = (sev) => {
        switch (sev) {
            case "critical": return "#ef4444";
            case "high": return "#f97316";
            case "medium": return "#eab308";
            default: return "#3b82f6";
        }
    };

    return (
        <div className="alerts-page">
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
            </div>

            <div className="alerts-content container">
                <div className="alerts-header">
                    <div>
                        <h2>{t("weather.title")}</h2>
                        <p className="text-dim">Stay updated on weather conditions affecting your fields</p>
                    </div>
                    <button
                        onClick={handleCheckAlerts}
                        disabled={checking}
                        className="btn-primary check-alerts-btn"
                    >
                        {checking ? "Scanning Fields..." : "Scan Fields for Alerts"}
                    </button>
                </div>

                {message && <div className="status-banner">{message}</div>}

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner" />
                        <p>Scanning field forecasts...</p>
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="empty-state glass-panel">
                        <div className="empty-icon">🌤️</div>
                        <h3>{t("weather.noAlerts")}</h3>
                        <p>We are continuously monitoring. Alerts will appear here if weather thresholds are crossed.</p>
                    </div>
                ) : (
                    <div className="alerts-list">
                        {alerts.map((alert) => (
                            <div
                                key={alert._id}
                                className={`alert-card glass-panel ${alert.isRead ? "read" : "unread"}`}
                                style={{ borderLeft: `5px solid ${getSeverityColor(alert.severity)}` }}
                            >
                                <div className="alert-body">
                                    <div className="alert-meta">
                                        <span className="field-tag">📍 {alert.field?.name || "Field"}</span>
                                        <span className="date-tag">{new Date(alert.createdAt).toLocaleString()}</span>
                                    </div>
                                    <h4 className="alert-title">{t(`weather.${alert.alertType}`, alert.title)}</h4>
                                    <p className="alert-message">{alert.message}</p>
                                    
                                    {alert.weatherData && (
                                        <div className="alert-weather-details">
                                            <span>🌡️ {alert.weatherData.temperature}°C</span>
                                            <span>💧 {alert.weatherData.humidity}% humidity</span>
                                            <span>💨 {alert.weatherData.windSpeed} m/s wind</span>
                                        </div>
                                    )}
                                </div>
                                <div className="alert-actions">
                                    {!alert.isRead && (
                                        <button onClick={() => handleMarkRead(alert._id)} className="btn-read">
                                            Mark Read
                                        </button>
                                    )}
                                    <button onClick={() => handleDismiss(alert._id)} className="btn-dismiss">
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
