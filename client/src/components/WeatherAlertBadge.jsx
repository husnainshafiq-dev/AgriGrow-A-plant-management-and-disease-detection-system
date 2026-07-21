import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export default function WeatherAlertBadge() {
    const { isAuthenticated, authHeaders } = useAuth();
    const { t } = useLanguage();
    const [count, setCount] = useState(0);
    const navigate = useNavigate();

    useEffect(() => {
        if (!isAuthenticated) return;

        const fetchAlerts = async () => {
            try {
                const res = await fetch("/api/weather/alerts?isRead=false", {
                    headers: authHeaders(),
                    credentials: "include"
                });
                if (res.ok) {
                    const data = await res.json();
                    setCount(data.data ? data.data.length : 0);
                }
            } catch (err) {
                console.error("Failed to fetch alerts count:", err);
            }
        };

        fetchAlerts();
        const interval = setInterval(fetchAlerts, 60000); // refresh every minute

        return () => clearInterval(interval);
    }, [isAuthenticated, authHeaders]);

    if (!isAuthenticated || count === 0) return null;

    return (
        <button
            onClick={() => navigate("/alerts")}
            style={{
                background: "rgba(239, 68, 68, 0.15)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                borderRadius: "20px",
                padding: "4.5px 12px",
                color: "#ef4444",
                fontSize: "12.5px",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                fontFamily: "'Outfit', sans-serif"
            }}
        >
            <span>🔔</span>
            <span>{count} {t("weather.alerts", "Alerts")}</span>
        </button>
    );
}
