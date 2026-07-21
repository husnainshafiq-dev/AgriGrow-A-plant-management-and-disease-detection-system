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

                {error && <div className="auth-error">{error}</div>}

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
