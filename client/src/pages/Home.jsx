import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "../context/LanguageContext";
import { saveOfflineScan, syncToServer } from "../offlineStorage";
import BookmarkButton from "../components/BookmarkButton";
import { isOfflineModelMarkedInstalled } from "../offlineModelMeta";
import "../offlineDownload.css";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function validate(file) {
    if (!ALLOWED_TYPES.includes(file.type)) return "Please select a JPG, PNG or WebP image.";
    if (file.size > MAX_FILE_SIZE) return "Image must be under 10 MB.";
    return null;
}

export default function Home({ modelReady, loadingStatus, isOnline, onOfflineModelReady }) {
    const { t } = useLanguage();
    const navigate = useNavigate();

    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [offlineInstalled, setOfflineInstalled] = useState(isOfflineModelMarkedInstalled);
    const [offlineDownloadProgress, setOfflineDownloadProgress] = useState(null);

    const inputRef = useRef(null);
    const resultRef = useRef(null);

    const handleFile = useCallback((f) => {
        const msg = validate(f);
        if (msg) { showError(msg); return; }
        setFile(f);
        setResult(null);
        const reader = new FileReader();
        reader.onload = (e) => setPreview(e.target.result);
        reader.readAsDataURL(f);
    }, []);

    const clearFile = () => {
        setFile(null);
        setPreview(null);
        setResult(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    const showError = (msg) => {
        setError(msg);
        setTimeout(() => setError(null), 3500);
    };

    const handleOfflineDownload = async () => {
        if (!isOnline || offlineDownloadProgress !== null) return;
        setError(null);
        setOfflineDownloadProgress(0);

        try {
            const { downloadOfflineAssets } = await import("../offlineInstaller");
            await downloadOfflineAssets((fraction) => {
                setOfflineDownloadProgress(Math.max(1, Math.round(fraction * 100)));
            });
            setOfflineInstalled(true);
            onOfflineModelReady?.(true);
        } catch (err) {
            console.error("[OFFLINE MODEL] Installation failed:", err);
            showError(`Offline detector download failed: ${err.message}`);
        } finally {
            setOfflineDownloadProgress(null);
        }
    };

    const isOnlineDetectorReady = async () => {
        try {
            const res = await fetch("/api/health", { cache: "no-store" });
            if (!res.ok) {
                console.warn("🔴 [HEALTH] /api/health returned HTTP", res.status);
                return false;
            }

            const data = await res.json();
            const mlStatus = data?.ml_service?.status;
            const ready = (
                data?.status === "ready" &&
                (mlStatus === "available" || mlStatus === "healthy") &&
                data?.ml_service?.model_loaded === true
            );
            if (!ready) {
                console.warn("🔴 [HEALTH] Online detector NOT ready. Full response:", JSON.stringify(data, null, 2));
            } else {
                console.log("🟢 [HEALTH] Online detector ready.");
            }
            return ready;
        } catch (err) {
            console.warn("🔴 [HEALTH] /api/health fetch failed:", err.message);
            return false;
        }
    };
    const shouldUseBrowserFallback = (res, data) => {
        const message = String(data?.error || data?.message || "");
        return (
            res.status >= 500 ||
            /disease detection service|ml service|ml model|temporarily unavailable|cannot reach/i.test(message)
        );
    };

    const handlePredict = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);
        setResult(null);

        try {
            if (isOnline) {
                const detectorReady = await isOnlineDetectorReady();
                if (!detectorReady) {
                    console.warn("Online disease service is not ready, using browser model fallback.");
                    await handleOfflinePredict();
                    return;
                }

                const fd = new FormData();
                fd.append("image", file);

                const res = await fetch("/api/disease/detect", {
                    method: "POST",
                    body: fd,
                    credentials: "include",
                });
                const data = await res.json().catch(() => ({}));

                if (!res.ok || data.error) {
                    if (shouldUseBrowserFallback(res, data)) {
                        console.warn("Online disease service unavailable, using browser model fallback.");
                        await handleOfflinePredict();
                        return;
                    }

                    showError(data.error || data.message || "Prediction failed");
                    return;
                }

                const resultData = data.data || data;
                setResult(resultData);
                setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
                return;
            }

            await handleOfflinePredict();
        } catch (err) {
            console.warn("Server unreachable, trying browser model fallback...", err);
            await handleOfflinePredict();
        } finally {
            setLoading(false);
        }
    };
    const handleOfflinePredict = async () => {
        if (!offlineInstalled) {
            showError(
                isOnline
                    ? "Download the offline detector first, then try again."
                    : "Offline detector is not installed. Connect to the internet to download it."
            );
            return;
        }

        const t0 = performance.now();
        console.log("🧠 [BROWSER FALLBACK] Starting browser-side prediction...");
        try {
            console.log("🧠 [BROWSER FALLBACK] Step 1/5: Importing offlineModel module...");
            const { loadOfflineModel, predictOffline, isModelLoaded } = await import("../offlineModel");
            console.log(`🧠 [BROWSER FALLBACK] Step 1 done (${((performance.now() - t0) / 1000).toFixed(2)}s). isModelLoaded=${isModelLoaded()}`);

            if (!isModelLoaded()) {
                console.log("🧠 [BROWSER FALLBACK] Step 2/5: Loading TF.js model into memory...");
                const loadedModel = await loadOfflineModel();
                console.log(`🧠 [BROWSER FALLBACK] Step 2 done (${((performance.now() - t0) / 1000).toFixed(2)}s). loadedModel=${!!loadedModel}, isModelLoaded=${isModelLoaded()}`);
                if (!loadedModel || !isModelLoaded()) {
                    console.error("❌ [BROWSER FALLBACK] Model load returned falsy or isModelLoaded still false. Aborting.");
                    showError("Browser disease model could not load. Please refresh once and try again.");
                    return;
                }
            } else {
                console.log("🧠 [BROWSER FALLBACK] Step 2/5: Model already loaded, skipping.");
            }
            onOfflineModelReady?.(true);

            console.log("🧠 [BROWSER FALLBACK] Step 3/5: Decoding image for inference...");
            const img = new Image();
            img.src = preview;
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = (e) => {
                    console.error("❌ [BROWSER FALLBACK] Image decode failed:", e);
                    reject(new Error("Image could not be decoded for browser inference"));
                };
            });
            console.log(`🧠 [BROWSER FALLBACK] Step 3 done (${((performance.now() - t0) / 1000).toFixed(2)}s). Image: ${img.naturalWidth}x${img.naturalHeight}`);

            console.log("🧠 [BROWSER FALLBACK] Step 4/5: Running TF.js inference...");
            const offlineResult = await predictOffline(img);
            console.log(`🧠 [BROWSER FALLBACK] Step 4 done (${((performance.now() - t0) / 1000).toFixed(2)}s). Prediction: ${offlineResult?.prediction} (${offlineResult?.confidence}%)`);

            setResult(offlineResult);
            console.log("🧠 [BROWSER FALLBACK] Step 5/5: Saving scan locally...");
            await saveOfflineScan(offlineResult, preview).catch((e) => console.warn("⚠️ [BROWSER FALLBACK] saveOfflineScan failed:", e.message));
            if (navigator.onLine) {
                syncToServer().catch((e) => console.warn("⚠️ [BROWSER FALLBACK] syncToServer failed:", e.message));
            }
            console.log(`✅ [BROWSER FALLBACK] Complete in ${((performance.now() - t0) / 1000).toFixed(2)}s.`);
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
        } catch (err) {
            console.error("❌ [BROWSER FALLBACK] Failed:", err);
            console.error("❌ [BROWSER FALLBACK] Stack:", err.stack);
            showError("Offline prediction failed: " + err.message);
        }
    };

    const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const onDragLeave = (e) => { e.preventDefault(); setDragOver(false); };
    const onDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer?.files?.[0];
        if (f) handleFile(f);
    };

    return (
        <div className="home-container">
            {/* Hero Section */}
            <section className="hero-section">
                <div className="hero-content">
                    <h2 className="hero-title">{t("dashboard.sub")}</h2>
                    <p className="hero-subtitle">Upload a photo of a leaf to instantly identify diseases, get treatment recommendations, and manage your farm with precision.</p>
                    <div className="hero-buttons">
                        <button className="btn-primary" onClick={() => document.getElementById('detector-widget').scrollIntoView({ behavior: 'smooth' })}>
                            {t("nav.detector")}
                        </button>
                        <button className="btn-secondary" onClick={() => navigate("/dashboard")}>
                            🗺️ {t("nav.dashboard")}
                        </button>
                        <button className="btn-secondary" onClick={() => navigate("/calendar")}>
                            📅 {t("nav.calendar")}
                        </button>
                        <button className="btn-secondary" onClick={() => navigate("/qa")}>
                            💬 {t("nav.qa")}
                        </button>
                    </div>
                </div>
            </section>

            {/* Main Content Area */}
            <main className="app-main" id="detector-widget" style={{ padding: "0 20px" }}>
                {!modelReady && (
                    <div className="model-status" style={{ margin: "0 auto 20px", display: "flex", justifyContent: "center" }}>
                        <span className="pulse" /> {loadingStatus}
                    </div>
                )}

                {isOnline && !offlineInstalled && (
                    <section className="offline-download-card" aria-live="polite">
                        <div className="offline-download-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M12 3v11" />
                                <path d="m8 10 4 4 4-4" />
                                <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                            </svg>
                        </div>
                        <div className="offline-download-copy">
                            <div className="offline-download-eyebrow">
                                <span>One-time setup</span>
                                <span className="offline-download-size">≈ 10 MB</span>
                            </div>
                            <h3>Take the crop doctor offline</h3>
                            <p>
                                Saved privately in this browser so disease detection opens
                                automatically—even without internet.
                            </p>
                            <div className="offline-download-benefits">
                                <span>✓ Works offline</span>
                                <span>✓ No repeated downloads</span>
                            </div>
                            {offlineDownloadProgress !== null && (
                                <div className="offline-progress">
                                    <div className="offline-progress-label">
                                        <span>Downloading offline detector…</span>
                                        <strong>{offlineDownloadProgress}%</strong>
                                    </div>
                                    <div className="offline-progress-track">
                                        <div
                                            className="offline-progress-fill"
                                            style={{ width: `${offlineDownloadProgress}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="offline-download-action">
                            <button
                                className="btn-primary offline-download-btn"
                                onClick={handleOfflineDownload}
                                disabled={offlineDownloadProgress !== null}
                            >
                                {offlineDownloadProgress !== null ? (
                                    <>
                                        <span className="spinner" />
                                        Saving…
                                    </>
                                ) : (
                                    <>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 3v11" />
                                            <path d="m8 10 4 4 4-4" />
                                            <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                                        </svg>
                                        Save for offline
                                    </>
                                )}
                            </button>
                            <small>Stored on this device</small>
                        </div>
                    </section>
                )}

                {offlineInstalled && (
                    <div className="offline-ready-note">
                        <span className="offline-ready-check">✓</span>
                        <span>
                            <strong>Offline detector ready</strong>
                            <small>Available without internet on this device</small>
                        </span>
                    </div>
                )}

                {/* Upload card */}
                <section className="card glass-panel" style={{ maxWidth: "600px", margin: "0 auto 30px" }}>
                    <div className="card-header text-center mb-4">
                        <h3 className="section-title">Plant Disease Detector</h3>
                        <p className="text-dim">Drag & drop a leaf image for instant AI analysis.</p>
                    </div>
                    <div
                        className={`dropzone${dragOver ? " drag-over" : ""}`}
                        onClick={() => inputRef.current?.click()}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
                        aria-label="Upload a leaf image"
                    >
                        {preview ? (
                            <div className="preview-wrap">
                                <img src={preview} alt="Leaf preview" className="preview-img" />
                                <button className="remove-btn" title="Remove" onClick={(e) => { e.stopPropagation(); clearFile(); }}>×</button>
                            </div>
                        ) : (
                            <div className="dropzone-inner">
                                <svg className="upload-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="17 8 12 3 7 8" />
                                    <line x1="12" y1="3" x2="12" y2="15" />
                                </svg>
                                <p className="dz-text">Drag & drop a leaf image here</p>
                                <p className="dz-sub">or click to browse · JPG, PNG up to 10 MB</p>
                            </div>
                        )}
                        <input
                            ref={inputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            hidden
                            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                        />
                    </div>

                    <button
                        className="btn-primary analyze-btn"
                        disabled={loading || !file}
                        onClick={handlePredict}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" />
                                Analysing…
                            </>
                        ) : !file ? (
                            "📸 Select Image to Analyse"
                        ) : (
                            "🔬 Analyse Leaf"
                        )}
                    </button>
                </section>

                {/* Result card */}
                {result && (
                    <section className="card result-card glass-panel" ref={resultRef} style={{ maxWidth: "700px", margin: "0 auto 30px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <span className={`badge ${(result.is_healthy ?? result.isHealthy) ? "badge-ok" : "badge-warn"}`}>
                                {(result.is_healthy ?? result.isHealthy) ? "✅ Healthy" : "⚠️ Disease Detected"}
                            </span>
                            {result._id && <BookmarkButton type="advisory" itemId={result._id} />}
                        </div>

                        <h2 className="pred-name">{result.prediction}</h2>

                        {/* Confidence */}
                        <div className="conf-block">
                            <div className="conf-header">
                                <span>Confidence</span>
                                <span className="conf-val">{result.confidence.toFixed(1)}%</span>
                            </div>
                            <div className="conf-track">
                                <div className="conf-fill" style={{ width: `${result.confidence}%` }} />
                            </div>
                        </div>

                        {/* Info */}
                        <div className="info-grid">
                            <div className="info-box">
                                <h3>🔬 Description</h3>
                                <p>{result.description || "—"}</p>
                            </div>
                            <div className="info-box">
                                <h3>💊 Recommendation</h3>
                                <p>{result.recommendation || "—"}</p>
                            </div>
                        </div>

                        {/* AI Advisory (Gemini) */}
                        {(result.aiAdvisory || result.ai_advisory) && (
                            <div className="info-box ai-advisory glass-panel-inner">
                                <h3>🤖 AI treatment &amp; prevention guide</h3>
                                <div className="advisory-text" style={{ whiteSpace: "pre-wrap" }}>
                                    {(result.aiAdvisory || result.ai_advisory)}
                                </div>
                            </div>
                        )}

                        {/* Top predictions */}
                        <div className="top-preds">
                            <h3>Top Predictions</h3>
                            <ul>
                                {(result.top_predictions ?? result.topPredictions)?.map((p, i) => (
                                    <li key={i}>
                                        <span className="tp-name" title={p.class}>{p.class}</span>
                                        <div className="tp-track">
                                            <div className="tp-fill" style={{ width: `${p.probability}%` }} />
                                        </div>
                                        <span className="tp-pct">{p.probability.toFixed(1)}%</span>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button className="btn-secondary" onClick={clearFile} style={{ width: "100%", marginTop: "16px" }}>
                            🔄 Try Another Image
                        </button>
                    </section>
                )}
            </main>

            {/* Features Section */}
            <section className="features-section">
                <div className="container">
                    <h2 className="section-title text-center">Powerful Features for Precision Agriculture</h2>
                    <div className="features-grid">
                        <div className="feature-card glass-panel">
                            <div className="feature-icon">🔬</div>
                            <h3>AI Disease Detection</h3>
                            <p>Instantly diagnose crop diseases with high accuracy using our trained machine learning models.</p>
                        </div>
                        <div className="feature-card glass-panel">
                            <div className="feature-icon">🤖</div>
                            <h3>Gemini AI Advisory</h3>
                            <p>Get personalized treatment plans, prevention guides, and cost estimates powered by advanced AI.</p>
                        </div>
                        <div className="feature-card glass-panel">
                            <div className="feature-icon">📡</div>
                            <h3>Offline Support</h3>
                            <p>Analyze leaves even without an internet connection using our optimized in-browser AI model.</p>
                        </div>
                        <div className="feature-card glass-panel">
                            <div className="feature-icon">🗺️</div>
                            <h3>Precision Dashboard</h3>
                            <p>Map your fields, calculate acreage, and monitor hyper-local weather to manage your farm efficiently.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Error toast */}
            {error && <div className="toast">{error}</div>}
        </div>
    );
}
