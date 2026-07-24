import { useLanguage } from "../context/LanguageContext";

export default function Footer({ isOnline, isModelLoaded }) {
    const { t } = useLanguage();

    return (
        <footer className="landing-footer glass-panel">
            <div className="footer-content" style={{ textAlign: "center" }}>
                <div className="footer-logo" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "10px" }}>
                    <span className="logo-icon">🌿</span>
                    <h3 style={{ fontSize: "16px", color: "white" }}>AgriGrow</h3>
                </div>
                <p style={{ fontSize: "13px", color: "#94a3b8" }}>Built with 🌱 using MobileNetV2 &amp; TensorFlow · 28-class crop disease classifier</p>
                <p style={{ fontSize: "12px", color: "#64748b", marginTop: "8px" }}>
                    {!isOnline && isModelLoaded ? "📡 Offline Mode Active" : "Designed for sustainable farming."}
                </p>
            </div>
        </footer>
    );
}
