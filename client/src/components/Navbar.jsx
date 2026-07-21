import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import LanguageSwitcher from "./LanguageSwitcher";
import WeatherAlertBadge from "./WeatherAlertBadge";
import "./Navbar.css";

export default function Navbar({ modelReady, loadingStatus, isOnline, installPrompt, handleInstall }) {
    const { isAuthenticated, user, logout } = useAuth();
    const { t } = useLanguage();
    const navigate = useNavigate();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    const handleLogoutClick = async () => {
        await logout();
        setDropdownOpen(false);
        navigate("/");
    };

    return (
        <nav className="navbar glass-panel">
            <div className="nav-container">
                <Link to="/" className="logo" onClick={() => setMobileMenuOpen(false)}>
                    <span className="logo-icon" aria-hidden="true">🌿</span>
                    <h1><span className="highlight">AgriGrow</span></h1>
                </Link>

                {/* Desktop Nav Links */}
                <div className="nav-links-desktop">
                    <Link to="/detect">{t("nav.detector")}</Link>
                    <Link to="/dashboard">{t("nav.dashboard")}</Link>
                    <Link to="/calendar">{t("nav.calendar")}</Link>
                    <Link to="/market">{t("nav.market")}</Link>
                    <Link to="/qa">{t("nav.qa")}</Link>
                    <Link to="/community">{t("nav.community")}</Link>
                    {isAuthenticated && user?.role === "admin" && (
                        <Link to="/admin" className="nav-admin-link">⚙️ Admin</Link>
                    )}
                </div>

                <div className="nav-actions-desktop">
                    {/* Active Weather Notification Alert Bell */}
                    <WeatherAlertBadge />

                    {/* Language Switcher */}
                    <LanguageSwitcher />

                    {/* Connection Status indicator */}
                    {modelReady && (
                        <div className={`connection-status ${isOnline ? "online" : "offline"}`}>
                            <span className={isOnline ? "dot-online" : "dot-offline"} />
                            <span className="status-text">{isOnline ? t("nav.online") : t("nav.offline")}</span>
                        </div>
                    )}

                    {/* Install app btn */}
                    {installPrompt && (
                        <button className="install-btn" onClick={handleInstall}>
                            📲 Install
                        </button>
                    )}

                    {/* Authentication state profile widget */}
                    {isAuthenticated ? (
                        <div className="profile-dropdown-wrapper">
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="nav-profile-trigger"
                            >
                                <img
                                    src={user?.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=40&h=40&fit=crop&crop=face"}
                                    alt="User Avatar"
                                    className="nav-avatar-img"
                                />
                                <span className="nav-username">{user?.name?.split(" ")[0]}</span>
                            </button>

                            {dropdownOpen && (
                                <div className="profile-dropdown glass-panel">
                                    <Link to="/profile" onClick={() => setDropdownOpen(false)}>👤 {t("nav.profile")}</Link>
                                    <Link to="/bookmarks" onClick={() => setDropdownOpen(false)}>🔖 {t("nav.bookmarks")}</Link>
                                    {user?.role === "admin" && (
                                        <Link to="/admin" onClick={() => setDropdownOpen(false)}>⚙️ Admin Dashboard</Link>
                                    )}
                                    <button onClick={handleLogoutClick} className="dropdown-logout-btn">
                                        🚪 {t("nav.logout")}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="nav-auth-buttons">
                            <Link to="/login" className="btn-login">{t("nav.login")}</Link>
                            <Link to="/register" className="btn-register">{t("nav.register")}</Link>
                        </div>
                    )}
                </div>

                {/* Mobile Hamburger menu button */}
                <button
                    className={`hamburger-btn ${mobileMenuOpen ? "open" : ""}`}
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    aria-label="Toggle Menu"
                >
                    <span className="bar bar-1"></span>
                    <span className="bar bar-2"></span>
                    <span className="bar bar-3"></span>
                </button>
            </div>

            {/* Mobile Dropdown Nav links drawer */}
            {mobileMenuOpen && (
                <div className="nav-mobile-drawer glass-panel">
                    <div className="mobile-links">
                        <Link to="/detect" onClick={() => setMobileMenuOpen(false)}>🔍 {t("nav.detector")}</Link>
                        <Link to="/dashboard" onClick={() => setMobileMenuOpen(false)}>🗺️ {t("nav.dashboard")}</Link>
                        <Link to="/calendar" onClick={() => setMobileMenuOpen(false)}>📅 {t("nav.calendar")}</Link>
                        <Link to="/market" onClick={() => setMobileMenuOpen(false)}>💰 {t("nav.market")}</Link>
                        <Link to="/qa" onClick={() => setMobileMenuOpen(false)}>💬 {t("nav.qa")}</Link>
                        <Link to="/community" onClick={() => setMobileMenuOpen(false)}>👥 {t("nav.community")}</Link>
                        {isAuthenticated && user?.role === "admin" && (
                            <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>⚙️ Admin</Link>
                        )}
                        
                        <div className="drawer-separator"></div>

                        {isAuthenticated ? (
                            <>
                                <Link to="/profile" onClick={() => setMobileMenuOpen(false)}>👤 {t("nav.profile")}</Link>
                                <Link to="/bookmarks" onClick={() => setMobileMenuOpen(false)}>🔖 {t("nav.bookmarks")}</Link>
                                <button onClick={handleLogoutClick} className="drawer-logout-btn">
                                    🚪 {t("nav.logout")}
                                </button>
                            </>
                        ) : (
                            <div className="drawer-auth-row">
                                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn-login">{t("nav.login")}</Link>
                                <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn-register">{t("nav.register")}</Link>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
}
