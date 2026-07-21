/**
 * Offline Model — TensorFlow.js in-browser inference
 *
 * When the user is offline, this module loads a cached TF.js model
 * and performs disease prediction entirely in the browser.
 *
 * Usage:
 *   import { loadOfflineModel, predictOffline, isModelLoaded } from './offlineModel';
 *
 *   // Preload on app start:
 *   await loadOfflineModel();
 *
 *   // Predict (pass an HTMLImageElement):
 *   const result = await predictOffline(imgElement);
 */

import * as tf from "@tensorflow/tfjs";

// ── GLOBAL STATE (Persists across HMR/Re-renders) ───────────────────
// We attach to window in dev mode to prevent losing the model during hot-reloads
const _global = typeof window !== 'undefined' ? window : {};
_global.__AGRIGROW_STATE__ = _global.__AGRIGROW_STATE__ || {
    model: null,
    classNames: null,
    loadingPromise: null
};

const getState = () => _global.__AGRIGROW_STATE__;

/**
 * Disease descriptions and recommendations for offline use.
 * Mirrors the data in predict_server.py, extended for all 28 classes.
 */
const DISEASE_INFO = {
    Aphid: {
        description:
            "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        recommendation:
            "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
    },
    "Black Rust": {
        description:
            "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        recommendation:
            "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
    },
    Blast: {
        description:
            "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        recommendation:
            "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
    },
    Blight: {
        description:
            "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        recommendation:
            "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
    },
    "Brown Rust": {
        description:
            "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        recommendation:
            "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
    },
    "Common Root Rot": {
        description:
            "Caused by Bipolaris sorokiniana. Causes dark brown discoloration of the sub-crown internode and roots of wheat.",
        recommendation:
            "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
    },
    Common_Rust: {
        description:
            "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        recommendation:
            "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
    },
    Early_Blight: {
        description:
            'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        recommendation:
            "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    "Fusarium Head Blight": {
        description:
            "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        recommendation:
            "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
    },
    Gray_Leaf_Spot: {
        description:
            "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        recommendation:
            "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
    },
    Healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Continue regular care — proper watering, fertilisation, and pest monitoring.",
    },
    Late_Blight: {
        description:
            "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        recommendation:
            "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    "Leaf Blight": {
        description:
            "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        recommendation:
            "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
    },
    Pepper__bell___Bacterial_spot: {
        description:
            "Bacterial spot is caused by Xanthomonas bacteria. Small, water-soaked lesions appear on leaves, eventually turning dark brown and necrotic.",
        recommendation:
            "Remove and destroy infected plants. Apply copper-based bactericides. Use disease-free seeds and practice crop rotation.",
    },
    Pepper__bell___healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Continue regular watering, fertilisation, and monitoring for early signs of pests or disease.",
    },
    Potato___Early_blight: {
        description:
            'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        recommendation:
            "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    Potato___Late_blight: {
        description:
            "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        recommendation:
            "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    Potato___healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Maintain proper watering and nutrient management. Scout regularly for early disease symptoms.",
    },
    Tomato_Bacterial_spot: {
        description:
            "Caused by Xanthomonas species. Small, dark, raised spots appear on leaves, stems, and fruit.",
        recommendation:
            "Use copper sprays preventatively. Avoid working with wet plants. Use certified disease-free transplants.",
    },
    Tomato_Early_blight: {
        description:
            "Caused by Alternaria solani. Concentric ring bull's-eye lesions on lower, older leaves first.",
        recommendation:
            "Remove affected leaves. Apply appropriate fungicides. Mulch around plants and avoid overhead watering.",
    },
    Tomato_Late_blight: {
        description:
            "Caused by Phytophthora infestans. Large, dark, water-soaked patches with white mold on the underside.",
        recommendation:
            "Apply fungicide promptly. Remove and destroy all infected tissue. Improve air circulation around plants.",
    },
    Tomato_Leaf_Mold: {
        description:
            "Caused by Passalora fulva. Yellow spots on upper leaf surfaces with olive-green to grey mold beneath.",
        recommendation:
            "Improve ventilation in greenhouses. Reduce humidity. Apply fungicides and remove infected leaves.",
    },
    Tomato_Septoria_leaf_spot: {
        description:
            "Caused by Septoria lycopersici. Numerous small, circular spots with dark borders and grey centres.",
        recommendation:
            "Remove lower infected leaves. Apply fungicides. Practice crop rotation and avoid overhead irrigation.",
    },
    Tomato_Spider_mites_Two_spotted_spider_mite: {
        description:
            "Tiny spider mites feed on leaf cells, causing stippling, yellowing, and fine webbing on undersides.",
        recommendation:
            "Spray with miticides or insecticidal soap. Increase humidity. Introduce predatory mites as biological control.",
    },
    Tomato__Target_Spot: {
        description:
            "Caused by Corynespora cassiicola. Brown lesions with concentric rings on leaves, stems, and fruit.",
        recommendation:
            "Apply fungicides. Remove infected plant debris. Space plants for good air circulation.",
    },
    Tomato__Tomato_YellowLeaf__Curl_Virus: {
        description:
            "A viral disease transmitted by whiteflies. Leaves curl upward, turn yellow, and plants become stunted.",
        recommendation:
            "Control whitefly populations with insecticides or sticky traps. Use virus-resistant varieties. Remove infected plants.",
    },
    Tomato__Tomato_mosaic_virus: {
        description:
            "A highly contagious viral disease causing mottled light/dark green patterns on leaves, sometimes with curling.",
        recommendation:
            "Remove and destroy infected plants. Disinfect tools. Use resistant varieties and avoid tobacco products near plants.",
    },
    Tomato_healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
    },
};

/**
 * Human-readable class names for display.
 */
const DISPLAY_NAMES = {
    Aphid: "Aphid Infestation",
    "Black Rust": "Black (Stem) Rust",
    Blast: "Rice Blast",
    Blight: "Blight",
    "Brown Rust": "Brown (Leaf) Rust",
    "Common Root Rot": "Common Root Rot",
    Common_Rust: "Common Rust (Corn)",
    Early_Blight: "Early Blight",
    "Fusarium Head Blight": "Fusarium Head Blight",
    Gray_Leaf_Spot: "Gray Leaf Spot (Corn)",
    Healthy: "Healthy Plant",
    Late_Blight: "Late Blight",
    "Leaf Blight": "Leaf Blight",
    Pepper__bell___Bacterial_spot: "Pepper Bell — Bacterial Spot",
    Pepper__bell___healthy: "Pepper Bell — Healthy",
    Potato___Early_blight: "Potato — Early Blight",
    Potato___Late_blight: "Potato — Late Blight",
    Potato___healthy: "Potato — Healthy",
    Tomato_Bacterial_spot: "Tomato — Bacterial Spot",
    Tomato_Early_blight: "Tomato — Early Blight",
    Tomato_Late_blight: "Tomato — Late Blight",
    Tomato_Leaf_Mold: "Tomato — Leaf Mold",
    Tomato_Septoria_leaf_spot: "Tomato — Septoria Leaf Spot",
    Tomato_Spider_mites_Two_spotted_spider_mite: "Tomato — Spider Mites",
    Tomato__Target_Spot: "Tomato — Target Spot",
    Tomato__Tomato_YellowLeaf__Curl_Virus: "Tomato — Yellow Leaf Curl Virus",
    Tomato__Tomato_mosaic_virus: "Tomato — Mosaic Virus",
    Tomato_healthy: "Tomato — Healthy",
};

/* ── Public API ─────────────────────────────────────────────── */

/** Returns true when the TF.js model has been loaded into memory. */
export function isModelLoaded() {
    const state = getState();
    const loaded = !!(state.model && state.classNames && state.classNames.length > 0);
    if (!loaded) {
        console.warn("⚠️ [OFFLINE MODEL] isModelLoaded() check failed:", { 
            hasModel: !!state.model, 
            hasClasses: !!state.classNames,
            classCount: state.classNames?.length || 0,
            hasLoadingPromise: !!state.loadingPromise
        });
    }
    return loaded;
}

let loadingPromise = null;

/**
 * Pre-load the TF.js model and class names.
 * Uses IndexedDB to cache the model topology and weights.
 */
const MODEL_VERSION = "2.2.1"; // Increment this to force-refresh all clients

export async function loadOfflineModel(onProgress) {
    const state = getState();
    
    // If already loaded, return immediately
    if (state.model && state.classNames) {
        onProgress?.(1);
        return state.model;
    }
    
    // If already loading, return the existing promise
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
        console.log(`🚀 [OFFLINE MODEL] Starting load sequence (v${MODEL_VERSION})...`);
        const startTime = performance.now();
        const INDEXEDDB_URL = "indexeddb://plant-disease-model";
        const NETWORK_URL = "/model/model.json";

        try {
            onProgress?.(0.01);
            await tf.ready();
            onProgress?.(0.03);

            // ── CACHE BUSTING CHECK ─────────────────────────────────────────
            const cachedVersion = localStorage.getItem("agrigrow_model_version");
            if (cachedVersion !== MODEL_VERSION) {
                console.warn(`🔄 [OFFLINE MODEL] Version mismatch (Cached: ${cachedVersion}, App: ${MODEL_VERSION}). Clearing cache...`);
                try {
                    await tf.io.removeModel(INDEXEDDB_URL);
                    localStorage.removeItem("agrigrow_class_names");
                } catch (e) {
                    // Ignore if model doesn't exist
                }
            }

            // 1. Try to load from IndexedDB first
            try {
                console.log("⏳ [OFFLINE MODEL] Checking IndexedDB cache...");
                const cachedModel = await tf.loadLayersModel(INDEXEDDB_URL);
                const cachedClasses = localStorage.getItem("agrigrow_class_names");
                
                if (cachedClasses) {
                    state.model = cachedModel;
                    state.classNames = JSON.parse(cachedClasses);
                    console.log("✅ [OFFLINE MODEL] Loaded from cache (IndexedDB).");
                    onProgress?.(1);
                    return state.model;
                }
                console.warn("⚠️ [OFFLINE MODEL] Cache partial: model found but class names missing.");
            } catch (cacheErr) {
                console.log("ℹ️ [OFFLINE MODEL] Cache miss or error. Proceeding to network...");
            }

            // 2. Load from Network
            // We use a timestamp to bypass any Service Worker / Browser cache for the model.json
            const bustUrl = `${NETWORK_URL}?v=${MODEL_VERSION}`;
            console.log(`⏳ [OFFLINE MODEL] Fetching from network: ${bustUrl}`);
            
            const networkModel = await tf.loadLayersModel(bustUrl, {
                fetchOptions: { cache: "no-cache" },
                onProgress: (fraction) => {
                    const downloadProgress = 0.05 + (fraction * 0.85);
                    onProgress?.(Math.min(downloadProgress, 0.9));
                },
            });
            
            onProgress?.(0.92);
            const classRes = await fetch(`/model/class_names.json?v=${MODEL_VERSION}`, { cache: "no-cache" });
            if (!classRes.ok) {
                throw new Error(`Class names download failed (HTTP ${classRes.status})`);
            }
            const networkClasses = await classRes.json();
            onProgress?.(1);

            // 3. Set globals immediately
            state.model = networkModel;
            state.classNames = networkClasses;

            // 4. Persist for next time (non-blocking)
            // We only do this if we actually fetched from network
            const persist = async () => {
                try {
                    // Quick check if already saved
                    const exists = await tf.io.listModels();
                    if (exists[INDEXEDDB_URL]) {
                        console.log("ℹ️ [OFFLINE MODEL] Model already in IndexedDB. Skipping redundant save.");
                        localStorage.setItem("agrigrow_model_version", MODEL_VERSION);
                        return;
                    }

                    console.log("📥 [OFFLINE MODEL] Saving to IndexedDB...");
                    await networkModel.save(INDEXEDDB_URL);
                    localStorage.setItem("agrigrow_class_names", JSON.stringify(networkClasses));
                    localStorage.setItem("agrigrow_model_version", MODEL_VERSION);
                    console.log("✅ [OFFLINE MODEL] Persisted to cache.");
                } catch (sErr) {
                    console.warn("⚠️ [OFFLINE MODEL] Cache persist failed:", sErr);
                }
            };
            
            if (window.requestIdleCallback) window.requestIdleCallback(persist);
            else setTimeout(persist, 3000);


            const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✨ [OFFLINE MODEL] Load successful in ${totalTime}s.`);
            return state.model;
        } catch (err) {
            state.lastError = err;
            console.error("❌ [OFFLINE MODEL] Load failed:", err);
            // If network fails and we have an old cached version, we could try to load it anyway,
            // but here we prefer to fail early so the UI shows an error.
            return null;
        } finally {
            state.loadingPromise = null;
        }
    })();

    return state.loadingPromise;
}

/**
 * Run inference on an HTMLImageElement entirely in the browser.
 */
export async function downloadOfflineModel(onProgress) {
    onProgress?.(0.01);
    const model = await loadOfflineModel((fraction) => {
        onProgress?.(Math.min(fraction * 0.9, 0.9));
    });
    const state = getState();

    if (!model || !state.classNames) {
        throw state.lastError || new Error("The detector could not be downloaded");
    }

    onProgress?.(0.92);
    await model.save("indexeddb://plant-disease-model");
    onProgress?.(0.98);
    localStorage.setItem("agrigrow_class_names", JSON.stringify(state.classNames));
    localStorage.setItem("agrigrow_model_version", MODEL_VERSION);
    onProgress?.(1);
    return model;
}

export async function predictOffline(imageElement) {
    const state = getState();
    
    // Auto-load if not ready
    if (!state.model || !state.classNames) {
        console.log("ℹ️ [OFFLINE MODEL] Model not ready, attempting to load...");
        await loadOfflineModel();
        if (!state.model || !state.classNames) {
            throw new Error("Offline model not available — please go online first to cache it");
        }
    }

    // Pre-process exactly as MobileNetV2 expects
    const tensor = tf.tidy(() => {
        return tf.browser
            .fromPixels(imageElement)
            .resizeBilinear([224, 224])
            .toFloat()
            .div(127.5)
            .sub(1.0)
            .expandDims(0);
    });

    const predictions = state.model.predict(tensor);
    const probabilities = await predictions.data();

    // Clean up GPU memory
    tensor.dispose();
    predictions.dispose();

    // Rank all classes
    const ranked = Array.from(probabilities)
        .map((p, i) => ({ probability: p * 100, index: i }))
        .sort((a, b) => b.probability - a.probability);

    const top = ranked[0];
    const topClassName = state.classNames[top.index];
    const isHealthy = topClassName.toLowerCase().includes("healthy");
    const info = DISEASE_INFO[topClassName] || {};
    const displayName = DISPLAY_NAMES[topClassName] || topClassName;

    return {
        success: true,
        prediction: displayName,
        confidence: parseFloat(top.probability.toFixed(2)),
        is_healthy: isHealthy,
        description: info.description || "",
        recommendation: info.recommendation || "",
        top_predictions: ranked.slice(0, 5).map((p) => ({
            class: DISPLAY_NAMES[state.classNames[p.index]] || state.classNames[p.index],
            probability: parseFloat(p.probability.toFixed(2)),
        })),
        offline: true,
    };
}
