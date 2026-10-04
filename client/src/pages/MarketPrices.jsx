import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import PriceChart from "../components/PriceChart";
import "./MarketPrices.css";

export default function MarketPrices() {
    const { authHeaders, isAuthenticated, user } = useAuth();
    const { t } = useLanguage();
    const [prices, setPrices] = useState([]);
    const [trends, setTrends] = useState([]);
    const [crops, setCrops] = useState([]);
    const [mandis, setMandis] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedCrop, setSelectedCrop] = useState("all");
    const [graphCrop, setGraphCrop] = useState("wheat");
    const [selectedProvince, setSelectedProvince] = useState("all");
    const [selectedMandi, setSelectedMandi] = useState("all");
    const [priceHistory, setPriceHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Report Rate Form
    const [reportOpen, setReportOpen] = useState(false);
    const [reportCrop, setReportCrop] = useState("wheat");
    const [reportMandi, setReportMandi] = useState("");
    const [reportProvince, setReportProvince] = useState("Punjab");
    const [reportAvg, setReportAvg] = useState("");
    const [reportUnit, setReportUnit] = useState("per_40kg");
    const [reportMessage, setReportMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);

    // Tabs & Management
    const isAdmin = Boolean(isAuthenticated && ["superadmin", "admin"].includes(user?.role));
    const [activeTab, setActiveTab] = useState("all"); // "all" | "moderation" | "my-reports"
    const [myPrices, setMyPrices] = useState([]);
    const [myPricesLoading, setMyPricesLoading] = useState(false);
    const [moderationQueue, setModerationQueue] = useState([]);
    const [moderationLoading, setModerationLoading] = useState(false);
    const [moderationFilter, setModerationFilter] = useState("pending"); // "pending" | "all" | "approved" | "rejected"
    const [modActionId, setModActionId] = useState(null);
    const [deletingId, setDeletingId] = useState(null);
    const [actionFeedback, setActionFeedback] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [scrapingLive, setScrapingLive] = useState(false);
    const [lastRefreshed, setLastRefreshed] = useState(() => new Date());

    const INITIAL_VISIBLE_COUNT = 10;
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT);

    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE_COUNT);
    }, [selectedCrop, selectedProvince, selectedMandi, activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Latest prices
            const pricesRes = await fetch("/api/market/prices/latest");
            if (pricesRes.ok) {
                const data = await pricesRes.json();
                setPrices(data.data || []);
            }

            // Trends
            const trendsRes = await fetch("/api/market/prices/trends");
            if (trendsRes.ok) {
                const data = await trendsRes.json();
                setTrends(data.data || []);
            }

            // Distinct crops
            const cropsRes = await fetch("/api/market/crops");
            if (cropsRes.ok) {
                const data = await cropsRes.json();
                setCrops(data.data || []);
            }

            // Distinct mandis
            const mandisRes = await fetch("/api/market/mandis");
            if (mandisRes.ok) {
                const data = await mandisRes.json();
                setMandis(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch market data:", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchMyPrices = async () => {
        if (!isAuthenticated) return;
        setMyPricesLoading(true);
        try {
            const res = await fetch("/api/market/my-prices", {
                headers: {
                    ...authHeaders()
                },
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setMyPrices(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch user reported prices:", err);
        } finally {
            setMyPricesLoading(false);
        }
    };

    const fetchModerationQueue = async (filterStatus = moderationFilter) => {
        if (!isAdmin) return;
        setModerationLoading(true);
        try {
            const query = filterStatus && filterStatus !== "all" ? `?status=${filterStatus}` : "";
            const res = await fetch(`/api/market/moderation-queue${query}`, {
                headers: {
                    ...authHeaders()
                },
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setModerationQueue(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch moderation queue:", err);
        } finally {
            setModerationLoading(false);
        }
    };

    const fetchHistory = async () => {
        const cropToFetch = graphCrop || "wheat";
        setHistoryLoading(true);
        try {
            let url = `/api/market/prices/crop/${cropToFetch}?days=30`;
            if (selectedProvince !== "all") url += `&province=${selectedProvince}`;
            if (selectedMandi !== "all") url += `&market=${encodeURIComponent(selectedMandi)}`;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setPriceHistory(data.data || []);
            }
        } catch (err) {
            console.error("Failed to fetch price history:", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        if (isAuthenticated) {
            fetchMyPrices();
            if (isAdmin) {
                fetchModerationQueue("pending");
            }
        }
    }, [isAuthenticated, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        fetchHistory();
    }, [graphCrop, selectedProvince, selectedMandi]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleReportPriceSubmit = async (e) => {
        e.preventDefault();
        if (!reportMandi || !reportAvg) return;
        setSubmitting(true);
        setReportMessage("");

        try {
            const res = await fetch("/api/market/prices", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({
                    cropName: reportCrop,
                    market: reportMandi,
                    province: reportProvince,
                    price: {
                        average: Number(reportAvg),
                        unit: reportUnit
                    }
                })
            });

            const data = await res.json();
            if (res.ok) {
                setReportMessage(data.message || (isAdmin ? "Market price published directly" : "Price report submitted for admin approval"));
                setReportMandi("");
                setReportAvg("");
                fetchData();
                fetchMyPrices();
                if (isAdmin) fetchModerationQueue();
                setTimeout(() => {
                    setReportOpen(false);
                    setReportMessage("");
                }, 3000);
            } else {
                setReportMessage(data.error || "Submission failed");
            }
        } catch (err) {
            console.error("Price reporting failed:", err);
            setReportMessage("Network error. Try again.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleApprovePrice = async (priceId, cropName, market) => {
        if (!isAdmin || !priceId) return;
        setModActionId(priceId);
        setActionFeedback(null);
        try {
            const res = await fetch(`/api/market/prices/${priceId}/approve`, {
                method: "PATCH",
                headers: {
                    ...authHeaders()
                },
                credentials: "include"
            });
            const data = await res.json();
            if (res.ok) {
                setActionFeedback({ type: "success", text: `Approved price report for ${cropName?.toUpperCase()} in ${market}. It is now live on the app!` });
                fetchData();
                fetchModerationQueue();
                fetchMyPrices();
            } else {
                setActionFeedback({ type: "error", text: data.error || data.message || "Failed to approve price." });
            }
        } catch (err) {
            console.error("Approve price error:", err);
            setActionFeedback({ type: "error", text: "Network error while approving price." });
        } finally {
            setModActionId(null);
            setTimeout(() => setActionFeedback(null), 5000);
        }
    };

    const handleRejectPrice = async (priceId, cropName, market) => {
        if (!isAdmin || !priceId) return;
        const reason = window.prompt(`Optional: Enter rejection reason for ${cropName?.toUpperCase()} in ${market}:`, "Unrealistic price or invalid mandi details");
        if (reason === null) return; // User cancelled prompt

        setModActionId(priceId);
        setActionFeedback(null);
        try {
            const res = await fetch(`/api/market/prices/${priceId}/reject`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders()
                },
                credentials: "include",
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (res.ok) {
                setActionFeedback({ type: "success", text: `Rejected price submission for ${cropName?.toUpperCase()} in ${market}. It will not appear on the app.` });
                fetchData();
                fetchModerationQueue();
                fetchMyPrices();
            } else {
                setActionFeedback({ type: "error", text: data.error || data.message || "Failed to reject price." });
            }
        } catch (err) {
            console.error("Reject price error:", err);
            setActionFeedback({ type: "error", text: "Network error while rejecting price." });
        } finally {
            setModActionId(null);
            setTimeout(() => setActionFeedback(null), 5000);
        }
    };

    const handleDeletePrice = async (priceId, cropName, market) => {
        if (!isAdmin || !priceId) return;
        const cropLabel = cropName ? cropName.toUpperCase() : "item";
        const marketLabel = market ? ` in ${market}` : "";
        const confirmed = window.confirm(`Admin Action: Are you sure you want to permanently delete the rate record for ${cropLabel}${marketLabel}? This cannot be undone.`);
        if (!confirmed) return;

        setDeletingId(priceId);
        setActionFeedback(null);

        try {
            const res = await fetch(`/api/market/prices/${priceId}`, {
                method: "DELETE",
                headers: {
                    ...authHeaders()
                },
                credentials: "include"
            });

            const data = await res.json();
            if (res.ok) {
                setActionFeedback({ type: "success", text: data.message || "Market price record deleted successfully." });
                setPrices(prev => prev.filter(p => (p.id || p._id) !== priceId));
                setMyPrices(prev => prev.filter(p => (p._id || p.id) !== priceId));
                setModerationQueue(prev => prev.filter(p => (p._id || p.id) !== priceId));
                fetchHistory();
            } else {
                setActionFeedback({ type: "error", text: data.error || data.message || "Failed to delete price record." });
            }
        } catch (err) {
            console.error("Delete price error:", err);
            setActionFeedback({ type: "error", text: "Network error while deleting price record." });
        } finally {
            setDeletingId(null);
            setTimeout(() => setActionFeedback(null), 5000);
        }
    };

    const handleManualRefresh = async () => {
        setRefreshing(true);
        setActionFeedback(null);
        try {
            await Promise.all([
                fetchData(),
                fetchHistory(),
                isAuthenticated ? fetchMyPrices() : Promise.resolve(),
                isAdmin ? fetchModerationQueue() : Promise.resolve(),
            ]);
            setLastRefreshed(new Date());
            setActionFeedback({
                type: "success",
                text: "Market prices updated! Checked latest mandi logs."
            });
        } catch (err) {
            console.error("Refresh failed:", err);
            setActionFeedback({
                type: "error",
                text: "Failed to refresh market prices. Please check your network connection."
            });
        } finally {
            setRefreshing(false);
            setTimeout(() => setActionFeedback(null), 4000);
        }
    };

    const handleAdminSyncScrape = async () => {
        if (!isAdmin) return;
        setScrapingLive(true);
        setActionFeedback(null);
        try {
            const res = await fetch("/api/market/scrape-now", {
                method: "POST",
                headers: {
                    ...authHeaders()
                },
                credentials: "include"
            });
            const data = await res.json();
            if (res.ok) {
                const uniqueCount = data.data?.unique || 0;
                setActionFeedback({
                    type: "success",
                    text: `AMIS live sync complete! Scraped & verified ${uniqueCount} commodity rates.`
                });
                await Promise.all([fetchData(), fetchHistory(), fetchModerationQueue()]);
                setLastRefreshed(new Date());
            } else {
                setActionFeedback({
                    type: "error",
                    text: data.error || data.message || "AMIS live scrape failed."
                });
            }
        } catch (err) {
            console.error("AMIS live sync error:", err);
            setActionFeedback({
                type: "error",
                text: "Network error during AMIS live scrape."
            });
        } finally {
            setScrapingLive(false);
            setTimeout(() => setActionFeedback(null), 5000);
        }
    };

    const canDeletePrice = isAdmin;
    const canDeleteAny = isAdmin;
    const pendingModCount = moderationQueue.filter(p => p.moderationStatus === "pending" || (!p.isVerified && p.moderationStatus !== "rejected")).length;

    const getTrendColorClass = (pct) => {
        if (pct > 0) return "trend-up";
        if (pct < 0) return "trend-down";
        return "trend-stable";
    };

    const getTrendIcon = (pct) => {
        if (pct > 0) return "📈";
        if (pct < 0) return "📉";
        return "➡️";
    };

    const formatPriceUnitName = (u) => {
        switch (u) {
            case "per_kg": return "/ kg";
            case "per_maund": return "/ maund (37.3 kg)";
            case "per_100kg": return "/ 100 kg (govt)";
            default: return "/ 40 kg";
        }
    };

    const formatPriceRange = (price) => {
        if (!price) return "—";
        const avg = price.average || 0;
        const min = price.min && price.min > 0 ? price.min : Math.round(avg * 0.95);
        const max = price.max && price.max > 0 ? price.max : Math.round(avg * 1.05);
        if (!min && !max) return "—";
        return `₨ ${min.toLocaleString()} - ${max.toLocaleString()}`;
    };

    const filteredPrices = prices.filter(p => {
        const matchesCrop = selectedCrop === "all" || p.cropName?.toLowerCase() === selectedCrop.toLowerCase();
        const matchesProvince = selectedProvince === "all" || p.province === selectedProvince;
        const matchesMandi = selectedMandi === "all" || p.market === selectedMandi;
        return matchesCrop && matchesProvince && matchesMandi;
    });

    const displayedPrices = filteredPrices.slice(0, visibleCount);
    const hasMore = filteredPrices.length > visibleCount;
    const isExpanded = visibleCount > INITIAL_VISIBLE_COUNT;

    if (!isAuthenticated) {
        return (
            <div className="market-page">
                <div className="bg-blobs">
                    <div className="blob blob-1"></div>
                    <div className="blob blob-3"></div>
                </div>
                <div className="market-container auth-gate-container">
                    <div className="auth-gate-card glass-panel">
                        <div className="auth-gate-icon">💰</div>
                        <h2>{t("nav.market")} — Mandi Tracker</h2>
                        <p className="auth-gate-desc">
                            Live mandi rates, crop price history graphs, commodity trends, and farmer rate submissions are available for registered AgriGrow members. Please log in to view current market prices.
                        </p>
                        <div className="auth-gate-actions">
                            <Link to="/login?redirect=/market" className="btn-primary auth-gate-btn">
                                🔐 Log In to View Market Prices
                            </Link>
                            <Link to="/register?redirect=/market" className="btn-secondary auth-gate-btn">
                                🌱 Create Free Account
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="market-page">
            <div className="bg-blobs">
                <div className="blob blob-1"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="market-content container">
                <div className="market-header">
                    <div>
                        <h2>{t("market.title")}</h2>
                        <div className="header-meta">
                            <p className="text-dim">Mandi prices tracking across Pakistan</p>
                            {lastRefreshed && (
                                <span className="live-sync-indicator" title="Time of last price update check">
                                    <span className="pulse-dot"></span>
                                    Updated: {lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="market-header-actions">
                        <button
                            type="button"
                            onClick={handleManualRefresh}
                            disabled={refreshing || loading}
                            className="refresh-prices-btn"
                            title="Check for any price updates"
                            aria-label="Refresh Prices"
                        >
                            <span className={`refresh-icon ${refreshing ? "spin-animation" : ""}`}>🔄</span>
                            <span>{refreshing ? "Checking Updates..." : "Refresh Prices"}</span>
                        </button>
                        {isAdmin && (
                            <button
                                type="button"
                                onClick={handleAdminSyncScrape}
                                disabled={scrapingLive || refreshing}
                                className="admin-sync-btn"
                                title="Trigger live web scrape from AMIS Punjab (Government Portal)"
                                aria-label="Sync Live AMIS"
                            >
                                <span className={`sync-icon ${scrapingLive ? "spin-animation" : ""}`}>⚡</span>
                                <span>{scrapingLive ? "Syncing AMIS..." : "Sync Live AMIS"}</span>
                            </button>
                        )}
                        {isAuthenticated && (
                            <button onClick={() => setReportOpen(true)} className="btn-primary report-price-btn">
                                📢 {t("market.reportPrice")}
                            </button>
                        )}
                    </div>
                </div>

                {/* Report Rate Modal */}
                {reportOpen && (
                    <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: "rgba(3, 7, 18, 0.8)", backdropFilter: "blur(8px)",
                        zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center",
                        padding: "16px"
                    }}>
                        <div className="glass-panel" style={{ width: "100%", maxWidth: "450px", padding: "24px" }}>
                            <h3 style={{ fontSize: "18px", color: "#f8fafc", marginBottom: "16px" }}>Report Mandi Price</h3>
                            
                            {reportMessage && <div className="status-banner" style={{ marginBottom: "16px" }}>{reportMessage}</div>}
                            
                            <form onSubmit={handleReportPriceSubmit} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                <div className="form-group">
                                    <label>Crop</label>
                                    <select value={reportCrop} onChange={(e) => setReportCrop(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                        <option value="wheat">Wheat (گندم)</option>
                                        <option value="cotton">Cotton (کپاس)</option>
                                        <option value="rice">Rice (چاول)</option>
                                        <option value="sugarcane">Sugarcane (گنا)</option>
                                        <option value="maize">Maize (مکئی)</option>
                                        <option value="potato">Potato (آلو)</option>
                                        <option value="onion">Onion (پیاز)</option>
                                        <option value="tomato">Tomato (ٹماٹر)</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Province</label>
                                    <select value={reportProvince} onChange={(e) => setReportProvince(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                        <option value="Punjab">Punjab</option>
                                        <option value="Sindh">Sindh</option>
                                        <option value="KPK">KPK</option>
                                        <option value="Balochistan">Balochistan</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Mandi / City</label>
                                    <input
                                        type="text" required placeholder="e.g. Sargodha Mandi" value={reportMandi}
                                        onChange={(e) => setReportMandi(e.target.value)}
                                        style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                    />
                                </div>
                                <div className="form-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                    <div className="form-group">
                                        <label>Avg Price (₨)</label>
                                        <input
                                            type="number" required placeholder="e.g. 4200" value={reportAvg}
                                            onChange={(e) => setReportAvg(e.target.value)}
                                            style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Unit</label>
                                        <select value={reportUnit} onChange={(e) => setReportUnit(e.target.value)} style={{ padding: "8px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "#0f172a", color: "white" }}>
                                            <option value="per_40kg">Per 40 kg</option>
                                            <option value="per_kg">Per kg</option>
                                            <option value="per_maund">Per maund</option>
                                        </select>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "10px" }}>
                                    <button type="button" onClick={() => setReportOpen(false)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.05)", color: "white", cursor: "pointer" }}>Cancel</button>
                                    <button type="submit" disabled={submitting} style={{ padding: "8px 20px", borderRadius: "8px", border: "none", background: "#10b981", color: "#030712", fontWeight: 600, cursor: "pointer" }}>
                                        {submitting ? "Submitting..." : "Submit Rate"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Top Trends Cards */}
                {trends.length > 0 && (
                    <div className="trends-container">
                        <h3>{t("market.trends")}</h3>
                        <div className="trends-grid">
                            {trends.slice(0, 4).map((tr, idx) => (
                                <div key={idx} className="trend-card glass-panel">
                                    <div className="trend-card-header">
                                        <h4>{tr.cropName.toUpperCase()}</h4>
                                        <span className={`trend-pct-badge ${getTrendColorClass(tr.changePct)}`}>
                                            {getTrendIcon(tr.changePct)} {tr.changePct}%
                                        </span>
                                    </div>
                                    <div className="trend-price-val">
                                        ₨ {tr.price} <span className="price-unit">{formatPriceUnitName(tr.unit)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Filters section */}
                <div className="market-filters glass-panel">
                    <div className="filter-group">
                        <label>Filter Crop</label>
                        <select value={selectedCrop} onChange={(e) => {
                            const val = e.target.value;
                            setSelectedCrop(val);
                            if (val !== "all") {
                                setGraphCrop(val);
                            }
                        }}>
                            <option value="all">All Crops</option>
                            {crops.length > 0 ? (
                                crops.map((c, i) => (
                                    <option key={i} value={c}>{c.toUpperCase()}</option>
                                ))
                            ) : (
                                <>
                                    <option value="wheat">WHEAT</option>
                                    <option value="cotton">COTTON</option>
                                    <option value="rice">RICE</option>
                                    <option value="sugarcane">SUGARCANE</option>
                                    <option value="maize">MAIZE</option>
                                    <option value="potato">POTATO</option>
                                    <option value="onion">ONION</option>
                                    <option value="tomato">TOMATO</option>
                                </>
                            )}
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Filter Province</label>
                        <select value={selectedProvince} onChange={(e) => setSelectedProvince(e.target.value)}>
                            <option value="all">All Provinces</option>
                            <option value="Punjab">Punjab</option>
                            <option value="Sindh">Sindh</option>
                            <option value="KPK">KPK</option>
                            <option value="Balochistan">Balochistan</option>
                        </select>
                    </div>

                    <div className="filter-group">
                        <label>Filter Market</label>
                        <select value={selectedMandi} onChange={(e) => setSelectedMandi(e.target.value)}>
                            <option value="all">All Markets</option>
                            {mandis.map((m, i) => (
                                <option key={i} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Main Graph Card */}
                <div className="price-chart-card glass-panel">
                    <div className="chart-header">
                        <h3>Price Fluctuation History</h3>
                        <span className="crop-details-lbl">{graphCrop.toUpperCase()} history (Last 30 days)</span>
                    </div>

                    {historyLoading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                            <p>Loading historical price logs...</p>
                        </div>
                    ) : (
                        <PriceChart data={priceHistory} height={250} />
                    )}
                </div>

                {/* Mandi Rates Table */}
                <div className="rates-table-card glass-panel">
                    <div className="rates-table-header">
                        <div className="rates-tabs">
                            <button
                                type="button"
                                className={`rate-tab-btn ${activeTab === "all" ? "active" : ""}`}
                                onClick={() => setActiveTab("all")}
                            >
                                🌐 {t("market.latestPrices")}
                            </button>
                            {isAdmin && (
                                <button
                                    type="button"
                                    className={`rate-tab-btn ${activeTab === "moderation" ? "active" : ""}`}
                                    onClick={() => {
                                        setActiveTab("moderation");
                                        fetchModerationQueue(moderationFilter);
                                    }}
                                >
                                    🛡️ Moderation Queue {pendingModCount > 0 && <span className="tab-badge-pending">{pendingModCount}</span>}
                                </button>
                            )}
                            {isAuthenticated && (
                                <button
                                    type="button"
                                    className={`rate-tab-btn ${activeTab === "my-reports" ? "active" : ""}`}
                                    onClick={() => {
                                        setActiveTab("my-reports");
                                        fetchMyPrices();
                                    }}
                                >
                                    📝 My Reported Rates {myPrices.length > 0 && <span className="tab-badge">{myPrices.length}</span>}
                                </button>
                            )}
                        </div>

                        {isAdmin && activeTab === "moderation" && (
                            <div className="mod-filter-group">
                                {["pending", "all", "approved", "rejected"].map((st) => (
                                    <button
                                        key={st}
                                        type="button"
                                        className={`mod-pill-btn ${moderationFilter === st ? "active" : ""}`}
                                        onClick={() => {
                                            setModerationFilter(st);
                                            fetchModerationQueue(st);
                                        }}
                                    >
                                        {st.charAt(0).toUpperCase() + st.slice(1)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {actionFeedback && (
                        <div className={`action-alert ${actionFeedback.type === "success" ? "alert-success" : "alert-error"}`}>
                            <span>{actionFeedback.type === "success" ? "✓" : "⚠️"}</span>
                            <span>{actionFeedback.text}</span>
                        </div>
                    )}

                    {activeTab === "all" ? (
                        loading ? (
                            <div className="loading-state">
                                <div className="spinner" />
                                <p>Fetching local mandi prices...</p>
                            </div>
                        ) : filteredPrices.length === 0 ? (
                            <div className="empty-state">
                                <p>No mandi rate logs match your current filter selection.</p>
                            </div>
                        ) : (
                            <>
                                <div className="table-responsive">
                                    <table className="prices-table">
                                        <thead>
                                            <tr>
                                                <th>Crop</th>
                                                <th>Mandi / City</th>
                                                <th>Province</th>
                                                <th>Price Range</th>
                                                <th>Average</th>
                                                <th>As of Date</th>
                                                {canDeleteAny && <th>Admin Action</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {displayedPrices.map((p) => {
                                                const pId = p.id || p._id;
                                                return (
                                                    <tr key={pId}>
                                                        <td className="crop-cell"><strong>{p.cropName.toUpperCase()}</strong></td>
                                                        <td>{p.market}</td>
                                                        <td><span className="province-tag">{p.province}</span></td>
                                                        <td>{formatPriceRange(p.price)}</td>
                                                        <td className="price-avg-cell">₨ {(p.price?.average || 0).toLocaleString()} <span className="unit-label">{formatPriceUnitName(p.price?.unit)}</span></td>
                                                        <td>{new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                                                        {canDeleteAny && (
                                                            <td className="action-cell">
                                                                <button
                                                                    type="button"
                                                                    className="delete-price-btn"
                                                                    onClick={() => handleDeletePrice(pId, p.cropName, p.market)}
                                                                    disabled={deletingId === pId}
                                                                    title="Delete this price entry (Admin Only)"
                                                                    aria-label={`Delete reported price for ${p.cropName}`}
                                                                >
                                                                    {deletingId === pId ? "Deleting..." : "🗑️ Delete"}
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {filteredPrices.length > INITIAL_VISIBLE_COUNT && (
                                    <div className="table-footer-controls">
                                        <div className="table-showing-text">
                                            Showing <span className="highlight-count">{displayedPrices.length}</span> of <span className="highlight-count">{filteredPrices.length}</span> prices
                                        </div>
                                        <div className="show-more-actions">
                                            {hasMore && (
                                                <button
                                                    type="button"
                                                    className="show-more-btn"
                                                    onClick={() => setVisibleCount(prev => Math.min(prev + 10, filteredPrices.length))}
                                                    title={`Show next 10 mandi rates (${filteredPrices.length - visibleCount} remaining)`}
                                                    aria-label="Show More Prices"
                                                >
                                                    <span>Show More</span>
                                                    <span className="dropdown-arrow">▾</span>
                                                </button>
                                            )}
                                            <div className="show-more-dropdown-container">
                                                <select
                                                    className="show-batch-select"
                                                    value={visibleCount >= filteredPrices.length ? "all" : visibleCount}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        if (val === "all") {
                                                            setVisibleCount(filteredPrices.length);
                                                        } else {
                                                            setVisibleCount(Number(val));
                                                        }
                                                    }}
                                                    title="Select how many prices to display"
                                                    aria-label="Select number of prices to display"
                                                >
                                                    <option value={10}>Show 10</option>
                                                    {filteredPrices.length > 20 && <option value={20}>Show 20</option>}
                                                    {filteredPrices.length > 50 && <option value={50}>Show 50</option>}
                                                    <option value="all">Show All ({filteredPrices.length})</option>
                                                </select>
                                            </div>
                                            {isExpanded && (
                                                <button
                                                    type="button"
                                                    className="show-less-btn"
                                                    onClick={() => setVisibleCount(INITIAL_VISIBLE_COUNT)}
                                                    title="Collapse back to top 10 prices"
                                                    aria-label="Show Less Prices"
                                                >
                                                    <span>Show Less</span>
                                                    <span className="dropdown-arrow">▴</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )
                    ) : activeTab === "moderation" ? (
                        /* Moderation Queue Tab (Admin Only) */
                        moderationLoading ? (
                            <div className="loading-state">
                                <div className="spinner" />
                                <p>Loading submissions for moderation...</p>
                            </div>
                        ) : moderationQueue.length === 0 ? (
                            <div className="empty-state">
                                <p>No reported prices found for filter: <strong>{moderationFilter}</strong>.</p>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="prices-table">
                                    <thead>
                                        <tr>
                                            <th>Crop</th>
                                            <th>Mandi / City</th>
                                            <th>Province</th>
                                            <th>Avg Price</th>
                                            <th>Submitted By</th>
                                            <th>Status</th>
                                            <th>Date</th>
                                            <th>Moderation Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {moderationQueue.map((p) => {
                                            const pId = p._id || p.id;
                                            const isApproved = p.isVerified || p.moderationStatus === "approved";
                                            const isRejected = p.moderationStatus === "rejected";
                                            const submitterName = p.submittedBy?.name || p.submittedBy?.email || "Farmer";
                                            return (
                                                <tr key={pId}>
                                                    <td className="crop-cell"><strong>{p.cropName?.toUpperCase()}</strong></td>
                                                    <td>{p.market}</td>
                                                    <td><span className="province-tag">{p.province}</span></td>
                                                    <td className="price-avg-cell">
                                                        ₨ {p.price?.average} <span className="unit-label">{formatPriceUnitName(p.price?.unit)}</span>
                                                    </td>
                                                    <td>
                                                        <div className="submitter-info">
                                                            <strong>{submitterName}</strong>
                                                            {p.submittedBy?.email && <div className="submitter-email">{p.submittedBy.email}</div>}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        {isApproved ? (
                                                            <span className="status-badge verified">✓ Live on App</span>
                                                        ) : isRejected ? (
                                                            <span className="status-badge rejected" title={p.rejectionReason || "Rejected by admin"}>
                                                                ❌ Rejected
                                                            </span>
                                                        ) : (
                                                            <span className="status-badge pending">⏳ Pending Review</span>
                                                        )}
                                                    </td>
                                                    <td>{new Date(p.date || p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                                                    <td className="action-cell">
                                                        <div className="mod-actions-group">
                                                            {!isApproved && (
                                                                <button
                                                                    type="button"
                                                                    className="approve-price-btn"
                                                                    onClick={() => handleApprovePrice(pId, p.cropName, p.market)}
                                                                    disabled={modActionId === pId}
                                                                    title="Approve and show rate on the app"
                                                                >
                                                                    {modActionId === pId ? "..." : "✅ Approve"}
                                                                </button>
                                                            )}
                                                            {!isRejected && (
                                                                <button
                                                                    type="button"
                                                                    className="reject-price-btn"
                                                                    onClick={() => handleRejectPrice(pId, p.cropName, p.market)}
                                                                    disabled={modActionId === pId}
                                                                    title="Reject rate from showing on app"
                                                                >
                                                                    {modActionId === pId ? "..." : "❌ Reject"}
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                className="delete-price-btn"
                                                                onClick={() => handleDeletePrice(pId, p.cropName, p.market)}
                                                                disabled={deletingId === pId}
                                                                title="Permanently delete price record"
                                                            >
                                                                {deletingId === pId ? "..." : "🗑️ Delete"}
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : (
                        /* My Reported Rates Tab */
                        myPricesLoading ? (
                            <div className="loading-state">
                                <div className="spinner" />
                                <p>Loading your reported rates...</p>
                            </div>
                        ) : myPrices.length === 0 ? (
                            <div className="empty-state">
                                <p>You haven't reported any mandi prices yet.</p>
                                <button
                                    type="button"
                                    onClick={() => setReportOpen(true)}
                                    className="btn-primary"
                                    style={{ marginTop: "12px", padding: "8px 16px", borderRadius: "8px" }}
                                >
                                    📢 Report a Mandi Price
                                </button>
                            </div>
                        ) : (
                            <div className="table-responsive">
                                <table className="prices-table">
                                    <thead>
                                        <tr>
                                            <th>Crop</th>
                                            <th>Mandi / City</th>
                                            <th>Province</th>
                                            <th>Avg Price</th>
                                            <th>Status</th>
                                            <th>Reported Date</th>
                                            {isAdmin && <th>Admin Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {myPrices.map((p) => {
                                            const pId = p._id || p.id;
                                            const isApproved = p.isVerified || p.moderationStatus === "approved";
                                            const isRejected = p.moderationStatus === "rejected";
                                            return (
                                                <tr key={pId}>
                                                    <td className="crop-cell"><strong>{p.cropName?.toUpperCase()}</strong></td>
                                                    <td>{p.market}</td>
                                                    <td><span className="province-tag">{p.province}</span></td>
                                                    <td className="price-avg-cell">
                                                        ₨ {p.price?.average} <span className="unit-label">{formatPriceUnitName(p.price?.unit)}</span>
                                                    </td>
                                                    <td>
                                                        {isApproved ? (
                                                            <span className="status-badge verified">✓ Live on App (Approved)</span>
                                                        ) : isRejected ? (
                                                            <span className="status-badge rejected" title={p.rejectionReason || "Rejected by admin"}>
                                                                ❌ Rejected by Admin {p.rejectionReason ? `— ${p.rejectionReason}` : ""}
                                                            </span>
                                                        ) : (
                                                            <span className="status-badge pending">⏳ Pending Admin Approval</span>
                                                        )}
                                                    </td>
                                                    <td>{new Date(p.date || p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                                                    {isAdmin && (
                                                        <td className="action-cell">
                                                            <button
                                                                type="button"
                                                                className="delete-price-btn"
                                                                onClick={() => handleDeletePrice(pId, p.cropName, p.market)}
                                                                disabled={deletingId === pId}
                                                                title="Delete this reported price (Admin Only)"
                                                                aria-label={`Delete reported price for ${p.cropName}`}
                                                            >
                                                                {deletingId === pId ? "Deleting..." : "🗑️ Delete"}
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    )}
                </div>
            </div>
        </div>
    );
}
