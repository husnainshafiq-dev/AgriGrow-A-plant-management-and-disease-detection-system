import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "../components/LanguageSwitcher";
import "./Login.css";

export default function Login() {
    const { login, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Get redirection path from query params, fallback to dashboard
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
        setLoading(true);
        try {
            await login(email, password);
            navigate(redirectPath, { replace: true });
        } catch (err) {
            setError(err.message || t("auth.invalidCreds"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="login-header-actions">
                <LanguageSwitcher />
            </div>

            <div className="login-card glass-panel">
                <div className="login-logo">
                    <span className="logo-icon">🌿</span>
                    <h2>AgriGrow</h2>
                </div>

                <h3 className="auth-title">{t("auth.loginTitle")}</h3>
                <p className="auth-sub">{t("auth.loginSub")}</p>

                {redirectPath && redirectPath !== "/dashboard" && redirectPath !== "/" && (
                    <div className="auth-redirect-notice">
                        <span className="notice-icon">🔐</span>
                        <span>
                            {redirectPath.startsWith("/market")
                                ? "Please log in to view Market Prices and live mandi rates."
                                : redirectPath.startsWith("/qa")
                                ? "Please log in to view Expert Consultation Q&A."
                                : redirectPath.startsWith("/community")
                                ? "Please log in to view community guides and discussions."
                                : redirectPath.startsWith("/calendar")
                                ? "Please log in to access your Crop Calendar."
                                : "Please log in to access this feature."}
                        </span>
                    </div>
                )}

                {error && <div className="auth-error">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
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

                    <button type="submit" className="btn-primary auth-submit" disabled={loading}>
                        {loading ? t("auth.loggingIn") : t("auth.logIn")}
                    </button>
                </form>

                <p className="auth-footer-text">
                    {t("auth.noAccount")}{" "}
                    <Link to={`/register?redirect=${encodeURIComponent(redirectPath)}`} className="auth-link">
                        {t("auth.signUp")}
                    </Link>
                </p>
            </div>
        </div>
    );
}
