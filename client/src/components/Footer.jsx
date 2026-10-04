import { useLocation } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";

export default function Footer({ isOnline, isModelLoaded }) {
    const { t } = useLanguage();
    const location = useLocation();
    const isDashboard = location.pathname === "/dashboard";
    const isOfflineActive = !isOnline && isModelLoaded;

    return (
        <footer className={`landing-footer glass-panel ${isDashboard ? "dashboard-footer" : ""}`}>
            <div className="footer-content">
                <div className="footer-logo">
                    <span className="logo-icon">🌿</span>
                    <h3 className="footer-brand">AgriGrow</h3>
                </div>
                <p className="footer-tech-note">
                    Built with 🌱 using MobileNetV2 &amp; TensorFlow · 28-class classifier
                </p>
                {isOfflineActive ? (
                    <span className="footer-offline-badge">📡 Offline Mode Active</span>
                ) : (
                    <p className="footer-tagline">Designed for sustainable farming.</p>
                )}
            </div>
        </footer>
    );
}
