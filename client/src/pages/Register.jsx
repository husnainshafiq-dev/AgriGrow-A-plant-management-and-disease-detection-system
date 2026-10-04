import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import "./Register.css";

export default function Register() {
    const { register, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [backendUrl, setBackendUrl] = useState(() => (typeof window !== "undefined" ? localStorage.getItem("agrigrow_api_url") || "" : ""));
    const [savedMsg, setSavedMsg] = useState("");

    const params = new URLSearchParams(location.search);
    const redirectPath = params.get("redirect") || "/dashboard";

    useEffect(() => {
        if (isAuthenticated) {
            navigate(redirectPath, { replace: true });
        }
    }, [isAuthenticated, navigate, redirectPath]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        setLoading(true);
        try {
            await register({
                name,
                email,
                phone: phone.replace(/[\s()-]/g, ""),
                password,
                confirmPassword,
                role: "farmer"
            });
            navigate(redirectPath, { replace: true });
        } catch (err) {
            setError(err.message || "Failed to create account");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="register-container">
            <div className="bg-blobs">
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="register-header-actions">
                <LanguageSwitcher />
            </div>

            <div className="register-card glass-panel">
                <div className="register-logo">
                    <span className="logo-icon">🌿</span>
                    <h2>AgriGrow</h2>
                </div>

                <h3 className="auth-title">{t("auth.registerTitle")}</h3>
                <p className="auth-sub">{t("auth.registerSub")}</p>

                {error && (
                    <div className="auth-error">
                        <div>{error}</div>
                        {(error.includes("server URL") || error.includes("not found") || error.includes("Cannot reach")) && (
                            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: "1px solid rgba(255,255,255,0.2)", textAlign: "left" }}>
                                <p style={{ fontSize: "12px", marginBottom: "6px", color: "#ffebee" }}>
                                    💡 <strong>Connect Render Backend:</strong> Paste your Render backend URL below:
                                </p>
                                <div style={{ display: "flex", gap: "6px" }}>
                                    <input
                                        type="url"
                                        placeholder="https://agrigrow-api.onrender.com"
                                        value={backendUrl}
                                        onChange={(e) => setBackendUrl(e.target.value)}
                                        style={{ flex: 1, padding: "7px 10px", borderRadius: "6px", border: "1px solid #ddd", color: "#111", fontSize: "12px", background: "#fff" }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!backendUrl.trim()) return;
                                            const clean = backendUrl.trim().replace(/\/$/, "");
                                            localStorage.setItem("agrigrow_api_url", clean);
                                            setError("");
                                            setSavedMsg("Connected! Try registering now.");
                                            setTimeout(() => setSavedMsg(""), 5000);
                                        }}
                                        style={{ padding: "7px 12px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}
                                    >
                                        Connect
                                    </button>
                                </div>
                                <p style={{ fontSize: "11px", marginTop: "5px", color: "rgba(255,255,255,0.7)" }}>
                                    Or set <code>VITE_API_URL</code> in your Vercel Project Settings and redeploy.
                                </p>
                            </div>
                        )}
                    </div>
                )}
                {savedMsg && <div style={{ background: "#e8f5e9", color: "#2e7d32", padding: "10px", borderRadius: "8px", marginBottom: "16px", fontSize: "13px", fontWeight: "bold", textAlign: "center" }}>{savedMsg}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label htmlFor="name">{t("auth.fullName")}</label>
                        <input
                            type="text"
                            id="name"
                            required
                            placeholder="Chaudhary Muhammad Ali"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="email">{t("auth.email")}</label>
                        <input
                            type="email"
                            id="email"
                            required
                            placeholder="farmer@agrigrow.pk"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="phone">{t("auth.phone")}</label>
                        <input
                            type="tel"
                            id="phone"
                            placeholder="+92 300 1234567"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                    </div>

                    <div className="form-grid">
                        <div className="form-group">
                            <label htmlFor="password">{t("auth.password")}</label>
                            <input
                                type="password"
                                id="password"
                                required
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">{t("auth.confirmPassword")}</label>
                            <input
                                type="password"
                                id="confirmPassword"
                                required
                                placeholder="••••••••"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <button type="submit" className="btn-primary auth-submit" disabled={loading}>
                        {loading ? t("auth.signingUp") : t("auth.signUp")}
                    </button>
                </form>

                <p className="auth-footer-text">
                    {t("auth.haveAccount")}{" "}
                    <Link to={`/login?redirect=${encodeURIComponent(redirectPath)}`} className="auth-link">
                        {t("auth.logIn")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
