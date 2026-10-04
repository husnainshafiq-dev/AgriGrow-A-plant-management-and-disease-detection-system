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
 * Extended for all 47 classes from the MobileNetV2 model.
 */
const DISEASE_INFO = {
    aphid: {
        description:
            "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        recommendation:
            "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
    },
    black_rust: {
        description:
            "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        recommendation:
            "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
    },
    blast: {
        description:
            "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        recommendation:
            "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
    },
    blight: {
        description:
            "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        recommendation:
            "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
    },
    brown_rust: {
        description:
            "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        recommendation:
            "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
    },
    common_root_rot: {
        description:
            "Caused by Bipolaris sorokiniana. Causes dark brown discoloration of the sub-crown internode and roots of wheat.",
        recommendation:
            "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
    },
    common_rust: {
        description:
            "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        recommendation:
            "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
    },
    cotton_bacterial_blight: {
        description:
            "Caused by Xanthomonas citri pv. malvacearum. Angular, water-soaked spots on leaves that turn brown/black, with black arm symptoms on stems.",
        recommendation:
            "Plant resistant varieties. Use acid-delinted certified seed. Apply copper-based sprays. Practice crop rotation.",
    },
    cotton_curl_virus: {
        description:
            "Cotton leaf curl virus (CLCuV) is transmitted by whitefly. Causes upward or downward curling, thickening of leaf veins, and stunted growth.",
        recommendation:
            "Control whitefly populations with insecticides or sticky traps. Plant CLCuV-resistant varieties. Remove infected plants early.",
    },
    cotton_fusarium_wilt: {
        description:
            "Caused by Fusarium oxysporum f. sp. vasinfectum. Wilting, yellowing, and browning of leaves, with vascular discoloration in cut stems.",
        recommendation:
            "Plant resistant varieties. Practice long crop rotations (3+ years). Avoid waterlogged conditions. Use biological controls (Trichoderma).",
    },
    cotton_healthy: {
        description:
            "The cotton plant appears healthy with no visible signs of disease or pest damage.",
        recommendation:
            "Continue regular care — proper irrigation, fertilisation, and integrated pest monitoring.",
    },
    early_blight: {
        description:
            'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        recommendation:
            "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    fusarium_head_blight: {
        description:
            "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        recommendation:
            "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
    },
    gray_leaf_spot: {
        description:
            "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        recommendation:
            "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
    },
    healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Continue regular care — proper watering, fertilisation, and pest monitoring.",
    },
    late_blight: {
        description:
            "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        recommendation:
            "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    leaf_blight: {
        description:
            "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        recommendation:
            "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
    },
    mango_anthracnose: {
        description:
            "Caused by Colletotrichum gloeosporioides. Black, sunken spots on leaves, flowers and fruit; blossom blight and fruit rot.",
        recommendation:
            "Apply copper-based or mancozeb fungicides during flowering. Prune to improve air circulation. Remove fallen debris.",
    },
    mango_bacterial_canker: {
        description:
            "Caused by Xanthomonas citri pv. mangiferaeindicae. Raised, dark lesions oozing bacterial exudate on stems, leaves and fruit.",
        recommendation:
            "Prune and destroy infected branches. Apply copper-based bactericides. Avoid overhead irrigation. Use disease-free nursery stock.",
    },
    mango_cutting_weevil: {
        description:
            "Mango cutting weevils bore into shoots, causing wilting and die-back of young branches.",
        recommendation:
            "Collect and destroy fallen fruit containing larvae. Apply insecticides during peak adult activity. Maintain orchard hygiene.",
    },
    mango_die_back: {
        description:
            "Caused by Lasiodiplodia theobromae. Drying and darkening of twigs starting from tips, progressing downward with gum exudation.",
        recommendation:
            "Prune infected branches 15 cm below visible symptoms. Apply copper oxychloride paste to cut ends. Improve tree vigor.",
    },
    mango_gall_midge: {
        description:
            "Gall midges lay eggs in young leaves/flowers, causing abnormal swellings (galls) that distort growth.",
        recommendation:
            "Remove and destroy galled plant parts. Apply systemic insecticides early in the season. Maintain orchard sanitation.",
    },
    mango_healthy: {
        description:
            "The mango plant appears healthy with no visible signs of disease or pest damage.",
        recommendation:
            "Continue regular care — proper irrigation, fertilisation, and integrated pest management.",
    },
    mango_powdery_mildew: {
        description:
            "Caused by Oidium mangiferae. White, powdery fungal growth on flowers, young leaves, and fruit; causes flower/fruit drop.",
        recommendation:
            "Apply sulphur-based or systemic fungicides at bud-break. Prune to improve air circulation. Avoid excess nitrogen.",
    },
    mango_sooty_mould: {
        description:
            "Black, sooty fungal coating on leaf surfaces, growing on honeydew excreted by sap-sucking insects (hoppers, mealybugs).",
        recommendation:
            "Control the underlying insect pest. Wash leaves with mild soapy water. Improve air circulation by pruning.",
    },
    mildew: {
        description:
            "Powdery or downy mildew appears as white, flour-like fungal growth on leaves and stems, causing yellowing and premature leaf drop.",
        recommendation:
            "Apply sulfur- or copper-based fungicides. Improve air circulation around plants and avoid wetting foliage when watering.",
    },
    mite: {
        description:
            "Mites are tiny arachnid pests that pierce plant tissue to suck sap, causing yellow stippling, leaf bronzing, and fine webbing.",
        recommendation:
            "Spray with miticides, neem oil, or insecticidal soap. Introduce predatory mites as natural biological controls.",
    },
    pepper_bell_bacterial_spot: {
        description:
            "Bacterial spot is caused by Xanthomonas bacteria. Small, water-soaked lesions appear on leaves, eventually turning dark brown and necrotic.",
        recommendation:
            "Remove and destroy infected plants. Apply copper-based bactericides. Use disease-free seeds and practice crop rotation.",
    },
    pepper_bell_healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Continue regular watering, fertilisation, and monitoring for early signs of pests or disease.",
    },
    potato_early_blight: {
        description:
            'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        recommendation:
            "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    potato_late_blight: {
        description:
            "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        recommendation:
            "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    potato_healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Maintain proper watering and nutrient management. Scout regularly for early disease symptoms.",
    },
    septoria: {
        description:
            "Septoria leaf blotch causes oval, greyish-brown spots with small black speck-like fruiting bodies (pycnidia) on leaves.",
        recommendation:
            "Apply foliar fungicides early. Practice crop rotation and remove infected plant debris to reduce overwintering fungi.",
    },
    smut: {
        description:
            "Smut is a fungal disease replacing plant tissue (heads or leaves) with dark, powdery masses of fungal spores.",
        recommendation:
            "Use certified disease-free treated seeds. Plant resistant crop varieties and rogue out infected heads before spore release.",
    },
    stem_fly: {
        description:
            "Stem fly larvae bore into plant stems, causing wilting, stem lodging, and drying of central leaves (dead hearts).",
        recommendation:
            "Apply systemic insecticides early in the season. Use yellow sticky traps and practice proper field sanitation.",
    },
    tan_spot: {
        description:
            "Tan spot (Pyrenophora tritici-repentis) causes small, tan to brown oval spots with dark centres and yellow halos on leaves.",
        recommendation:
            "Use resistant cultivars, apply foliar triazole/strobilurin fungicides, and practice stubble management or crop rotation.",
    },
    tomato_bacterial_spot: {
        description:
            "Caused by Xanthomonas species. Small, dark, raised spots appear on leaves, stems, and fruit.",
        recommendation:
            "Use copper sprays preventatively. Avoid working with wet plants. Use certified disease-free transplants.",
    },
    tomato_early_blight: {
        description:
            "Caused by Alternaria solani. Concentric ring bull's-eye lesions on lower, older leaves first.",
        recommendation:
            "Remove affected leaves. Apply appropriate fungicides. Mulch around plants and avoid overhead watering.",
    },
    tomato_late_blight: {
        description:
            "Caused by Phytophthora infestans. Large, dark, water-soaked patches with white mold on the underside.",
        recommendation:
            "Apply fungicide promptly. Remove and destroy all infected tissue. Improve air circulation around plants.",
    },
    tomato_leaf_mold: {
        description:
            "Caused by Passalora fulva. Yellow spots on upper leaf surfaces with olive-green to grey mold beneath.",
        recommendation:
            "Improve ventilation in greenhouses. Reduce humidity. Apply fungicides and remove infected leaves.",
    },
    tomato_septoria_leaf_spot: {
        description:
            "Caused by Septoria lycopersici. Numerous small, circular spots with dark borders and grey centres.",
        recommendation:
            "Remove lower infected leaves. Apply fungicides. Practice crop rotation and avoid overhead irrigation.",
    },
    tomato_spider_mites_two_spotted_spider_mite: {
        description:
            "Tiny spider mites feed on leaf cells, causing stippling, yellowing, and fine webbing on undersides.",
        recommendation:
            "Spray with miticides or insecticidal soap. Increase humidity. Introduce predatory mites as biological control.",
    },
    tomato_target_spot: {
        description:
            "Caused by Corynespora cassiicola. Brown lesions with concentric rings on leaves, stems, and fruit.",
        recommendation:
            "Apply fungicides. Remove infected plant debris. Space plants for good air circulation.",
    },
    tomato_yellow_leaf_curl_virus: {
        description:
            "A viral disease transmitted by whiteflies. Leaves curl upward, turn yellow, and plants become stunted.",
        recommendation:
            "Control whitefly populations with insecticides or sticky traps. Use virus-resistant varieties. Remove infected plants.",
    },
    tomato_mosaic_virus: {
        description:
            "A highly contagious viral disease causing mottled light/dark green patterns on leaves, sometimes with curling.",
        recommendation:
            "Remove and destroy infected plants. Disinfect tools. Use resistant varieties and avoid tobacco products near plants.",
    },
    tomato_healthy: {
        description: "The plant appears healthy with no visible signs of disease.",
        recommendation:
            "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
    },
    yellow_rust: {
        description:
            "Yellow (stripe) rust, caused by Puccinia striiformis, forms bright yellow pustules arranged in prominent linear stripes on leaves.",
        recommendation:
            "Plant resistant crop varieties. Apply foliar triazole fungicides at first sign of rust stripes.",
    },
};

/**
 * Human-readable class names for display.
 */
const DISPLAY_NAMES = {
    aphid: "Aphid Infestation",
    black_rust: "Black (Stem) Rust",
    blast: "Rice Blast",
    blight: "Blight",
    brown_rust: "Brown (Leaf) Rust",
    common_root_rot: "Common Root Rot",
    common_rust: "Common Rust (Corn)",
    cotton_bacterial_blight: "Cotton — Bacterial Blight",
    cotton_curl_virus: "Cotton — Curl Virus",
    cotton_fusarium_wilt: "Cotton — Fusarium Wilt",
    cotton_healthy: "Cotton — Healthy",
    early_blight: "Early Blight",
    fusarium_head_blight: "Fusarium Head Blight",
    gray_leaf_spot: "Gray Leaf Spot (Corn)",
    healthy: "Healthy Plant",
    late_blight: "Late Blight",
    leaf_blight: "Leaf Blight",
    mango_anthracnose: "Mango — Anthracnose",
    mango_bacterial_canker: "Mango — Bacterial Canker",
    mango_cutting_weevil: "Mango — Cutting Weevil",
    mango_die_back: "Mango — Die Back",
    mango_gall_midge: "Mango — Gall Midge",
    mango_healthy: "Mango — Healthy",
    mango_powdery_mildew: "Mango — Powdery Mildew",
    mango_sooty_mould: "Mango — Sooty Mould",
    mildew: "Powdery / Downy Mildew",
    mite: "Mite Infestation",
    pepper_bell_bacterial_spot: "Pepper Bell — Bacterial Spot",
    pepper_bell_healthy: "Pepper Bell — Healthy",
    potato_early_blight: "Potato — Early Blight",
    potato_healthy: "Potato — Healthy",
    potato_late_blight: "Potato — Late Blight",
    septoria: "Septoria Leaf Blotch",
    smut: "Smut Disease",
    stem_fly: "Stem Fly Damage",
    tan_spot: "Tan Spot",
    tomato_bacterial_spot: "Tomato — Bacterial Spot",
    tomato_early_blight: "Tomato — Early Blight",
    tomato_healthy: "Tomato — Healthy",
    tomato_late_blight: "Tomato — Late Blight",
    tomato_leaf_mold: "Tomato — Leaf Mold",
    tomato_mosaic_virus: "Tomato — Mosaic Virus",
    tomato_septoria_leaf_spot: "Tomato — Septoria Leaf Spot",
    tomato_spider_mites_two_spotted_spider_mite: "Tomato — Spider Mites",
    tomato_target_spot: "Tomato — Target Spot",
    tomato_yellow_leaf_curl_virus: "Tomato — Yellow Leaf Curl Virus",
    yellow_rust: "Yellow (Stripe) Rust",
};

/* ── Public API ─────────────────────────────────────────────── */

export const FALLBACK_CLASS_NAMES = [
    "aphid",
    "black_rust",
    "blast",
    "blight",
    "brown_rust",
    "common_root_rot",
    "common_rust",
    "cotton_bacterial_blight",
    "cotton_curl_virus",
    "cotton_fusarium_wilt",
    "cotton_healthy",
    "early_blight",
    "fusarium_head_blight",
    "gray_leaf_spot",
    "healthy",
    "late_blight",
    "leaf_blight",
    "mango_anthracnose",
    "mango_bacterial_canker",
    "mango_cutting_weevil",
    "mango_die_back",
    "mango_gall_midge",
    "mango_healthy",
    "mango_powdery_mildew",
    "mango_sooty_mould",
    "mildew",
    "mite",
    "pepper_bell_bacterial_spot",
    "pepper_bell_healthy",
    "potato_early_blight",
    "potato_healthy",
    "potato_late_blight",
    "septoria",
    "smut",
    "stem_fly",
    "tan_spot",
    "tomato_bacterial_spot",
    "tomato_early_blight",
    "tomato_healthy",
    "tomato_late_blight",
    "tomato_leaf_mold",
    "tomato_mosaic_virus",
    "tomato_septoria_leaf_spot",
    "tomato_spider_mites_two_spotted_spider_mite",
    "tomato_target_spot",
    "tomato_yellow_leaf_curl_virus",
    "yellow_rust"
];

export const CACHE_NAME = "tfjs-model-cache-v4";
const MODEL_VERSION = "4.0.0"; // 47-class MobileNetV2 model

// Automatically purge outdated/mismatched placeholder caches
if (typeof window !== "undefined" && typeof caches !== "undefined") {
    ["tfjs-model-cache", "tfjs-model-cache-v1", "tfjs-model-cache-v2", "tfjs-model-cache-v3"].forEach((old) => {
        caches.delete(old).catch(() => {});
    });
}

/* ── Custom Fetch for TF.js Model Assets ────────────────────── */
export async function customModelFetch(input, init) {
    const urlStr = typeof input === "string" ? input : input?.url || "";
    if (typeof caches !== "undefined") {
        try {
            const cache = await caches.open(CACHE_NAME);
            let match = await cache.match(input, { ignoreSearch: true }) || await cache.match(input);
            if (!match && urlStr) {
                const parsed = new URL(urlStr, window.location.origin);
                match = await cache.match(parsed.pathname, { ignoreSearch: true }) || await cache.match(parsed.pathname);
            }
            if (match && (match.ok || match.status === 200)) {
                return match.clone();
            }
        } catch (cErr) {
            console.warn("⚠️ [OFFLINE MODEL] Cache API check note:", cErr);
        }
    }
    return fetch(input, init);
}

/* ── Public API ─────────────────────────────────────────────── */

/** Returns true when the TF.js model has been loaded into memory. */
export function isModelLoaded() {
    const state = getState();
    if (state.model && (!state.classNames || state.classNames.length === 0)) {
        state.classNames = FALLBACK_CLASS_NAMES;
    }
    const loaded = !!(state.model && state.classNames && state.classNames.length > 0);
    return loaded;
}

let loadingPromise = null;

export async function loadOfflineModel(onProgress) {
    const state = getState();
    
    // If already loaded, return immediately
    if (state.model && state.classNames && state.classNames.length > 0) {
        onProgress?.(1);
        return state.model;
    }
    
    // If already loading, return the existing promise
    if (state.loadingPromise) return state.loadingPromise;

    state.loadingPromise = (async () => {
        console.log(`🚀 [OFFLINE MODEL] Starting load sequence (v${MODEL_VERSION})...`);
        const startTime = performance.now();
        const INDEXEDDB_URL = "indexeddb://plant-disease-model";
        const NETWORK_URL = "/models/plant-disease/model.json";

        try {
            onProgress?.(0.02);
            await tf.ready();
            onProgress?.(0.05);

            // Version check: if cached version in localStorage is older than 4.0.0, clear IndexedDB
            const storedVersion = localStorage.getItem("agrigrow_model_version");
            if (storedVersion && storedVersion !== MODEL_VERSION) {
                console.warn(`🔄 Version mismatch (${storedVersion} vs ${MODEL_VERSION}). Refreshing IndexedDB...`);
                try {
                    await tf.io.removeModel(INDEXEDDB_URL);
                    localStorage.removeItem("agrigrow_class_names");
                } catch (e) {}
            }

            // 1. Try to load from IndexedDB first
            try {
                console.log("⏳ [OFFLINE MODEL] Checking IndexedDB cache...");
                const cachedModel = await tf.loadGraphModel(INDEXEDDB_URL);
                if (cachedModel) {
                    let classes = null;
                    const cachedClasses = localStorage.getItem("agrigrow_class_names");
                    if (cachedClasses) {
                        try { classes = JSON.parse(cachedClasses); } catch (e) {}
                    }
                    if (!classes || !classes.length) {
                        classes = FALLBACK_CLASS_NAMES;
                    }
                    state.model = cachedModel;
                    state.classNames = classes;
                    console.log("✅ [OFFLINE MODEL] Loaded instantly from IndexedDB.");
                    onProgress?.(1);
                    return state.model;
                }
            } catch (cacheErr) {
                console.log("ℹ️ [OFFLINE MODEL] IndexedDB miss/stale. Purging and trying fresh load...", cacheErr?.message);
                try { await tf.io.removeModel(INDEXEDDB_URL); } catch (e) {}
            }

            // 2. Try loading with customModelFetch (Cache API first, then network)
            let networkModel = null;
            try {
                console.log(`⏳ [OFFLINE MODEL] Fetching model via customModelFetch: ${NETWORK_URL}`);
                networkModel = await tf.loadGraphModel(NETWORK_URL, {
                    fetchFunc: customModelFetch,
                    onProgress: (fraction) => {
                        const downloadProgress = 0.05 + (fraction * 0.85);
                        onProgress?.(Math.min(downloadProgress, 0.9));
                    },
                });
            } catch (cacheFetchErr) {
                console.warn("⚠️ [OFFLINE MODEL] Cache-assisted load failed, attempting direct fetch:", cacheFetchErr.message);
                // 3. Fallback: Direct clean fetch bypassing cache
                networkModel = await tf.loadGraphModel(NETWORK_URL, {
                    onProgress: (fraction) => {
                        const downloadProgress = 0.05 + (fraction * 0.85);
                        onProgress?.(Math.min(downloadProgress, 0.9));
                    },
                });
            }

            if (!networkModel) {
                throw new Error("TensorFlow.js could not initialize model from cached or remote source");
            }
            
            onProgress?.(0.92);
            let classes = null;
            const storedClasses = localStorage.getItem("agrigrow_class_names");
            if (storedClasses) {
                try { classes = JSON.parse(storedClasses); } catch (e) {}
            }
            if (!classes) {
                try {
                    const classRes = await customModelFetch(`/models/plant-disease/class_names.json?v=${MODEL_VERSION}`);
                    if (classRes.ok) {
                        classes = await classRes.json();
                    }
                } catch (e) {}
            }
            if (!classes || !classes.length) {
                classes = FALLBACK_CLASS_NAMES;
            }
            onProgress?.(1);

            // Set state
            state.model = networkModel;
            state.classNames = classes;
            localStorage.setItem("agrigrow_class_names", JSON.stringify(classes));
            localStorage.setItem("agrigrow_model_version", MODEL_VERSION);

            // Persist to IndexedDB
            try {
                await networkModel.save(INDEXEDDB_URL);
                console.log("✅ [OFFLINE MODEL] Successfully persisted model to IndexedDB.");
            } catch (sErr) {
                console.warn("⚠️ [OFFLINE MODEL] IndexedDB save warning:", sErr.message);
            }

            const totalTime = ((performance.now() - startTime) / 1000).toFixed(2);
            console.log(`✨ [OFFLINE MODEL] Load successful in ${totalTime}s.`);
            return state.model;
        } catch (err) {
            state.lastError = err;
            console.error("❌ [OFFLINE MODEL] Load failed:", err);
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

    // Pre-process with ImageNet normalisation
    // The new MobileNetV2 model expects:  (pixel / 255.0 - mean) / std
    const IMAGENET_MEAN = [0.485, 0.456, 0.406];
    const IMAGENET_STD = [0.229, 0.224, 0.225];

    const tensor = tf.tidy(() => {
        const img = tf.browser
            .fromPixels(imageElement)
            .resizeBilinear([224, 224])
            .toFloat()
            .div(255.0);

        const mean = tf.tensor1d(IMAGENET_MEAN);
        const std = tf.tensor1d(IMAGENET_STD);

        return img.sub(mean).div(std).expandDims(0);
    });

    const rawOutput = state.model.predict(tensor);

    // Apply softmax since the model outputs raw logits
    const probabilities = tf.tidy(() => tf.softmax(rawOutput));
    const values = await probabilities.data();

    // Clean up GPU memory
    tensor.dispose();
    rawOutput.dispose();
    probabilities.dispose();

    // Rank all classes
    const ranked = Array.from(values)
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
