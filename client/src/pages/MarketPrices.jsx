import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import PriceChart from "../components/PriceChart";
import "./MarketPrices.css";

export default function MarketPrices() {
    const { authHeaders, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const [prices, setPrices] = useState([]);
    const [trends, setTrends] = useState([]);
    const [crops, setCrops] = useState([]);
    const [mandis, setMandis] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [selectedCrop, setSelectedCrop] = useState("wheat");
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

    const fetchHistory = async () => {
        if (!selectedCrop) return;
        setHistoryLoading(true);
        try {
            let url = `/api/market/prices/crop/${selectedCrop}?days=30`;
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
    }, []);

    useEffect(() => {
        fetchHistory();
    }, [selectedCrop, selectedProvince, selectedMandi]); // eslint-disable-line react-hooks/exhaustive-deps

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
                setReportMessage(data.message || "Price report submitted for moderation");
                setReportMandi("");
                setReportAvg("");
                fetchData();
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
            default: return "/ 40 kg";
        }
    };

    const filteredPrices = prices.filter(p => {
        const matchesProvince = selectedProvince === "all" || p.province === selectedProvince;
        const matchesMandi = selectedMandi === "all" || p.market === selectedMandi;
        return matchesProvince && matchesMandi;
    });

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
                        <p className="text-dim">Mandi prices tracking across Pakistan</p>
                    </div>
                    {isAuthenticated && (
                        <button onClick={() => setReportOpen(true)} className="btn-primary report-price-btn">
                            📢 {t("market.reportPrice")}
                        </button>
                    )}
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
                        <select value={selectedCrop} onChange={(e) => setSelectedCrop(e.target.value)}>
                            {crops.length > 0 ? (
                                crops.map((c, i) => (
                                    <option key={i} value={c}>{c.toUpperCase()}</option>
                                ))
                            ) : (
                                <option value="wheat">WHEAT</option>
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
                        <span className="crop-details-lbl">{selectedCrop.toUpperCase()} history (Last 30 days)</span>
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
                    <h3>{t("market.latestPrices")}</h3>
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                            <p>Fetching local mandi prices...</p>
                        </div>
                    ) : filteredPrices.length === 0 ? (
                        <div className="empty-state">
                            <p>No mandi rate logs match your current filter selection.</p>
                        </div>
                    ) : (
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPrices.map((p) => (
                                        <tr key={p.id || p._id}>
                                            <td className="crop-cell"><strong>{p.cropName.toUpperCase()}</strong></td>
                                            <td>{p.market}</td>
                                            <td><span className="province-tag">{p.province}</span></td>
                                            <td>₨ {p.price.min} - {p.price.max}</td>
                                            <td className="price-avg-cell">₨ {p.price.average} <span className="unit-label">{formatPriceUnitName(p.price.unit)}</span></td>
                                            <td>{new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
