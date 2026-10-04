import {
    OFFLINE_MODEL_VERSION,
    OFFLINE_MODEL_VERSION_KEY,
} from "./offlineModelMeta";

const CACHE_NAME = "tfjs-model-cache";
const MODEL_URL = `/models/plant-disease/model.json?v=${OFFLINE_MODEL_VERSION}`;
const CLASS_NAMES_URL = `/models/plant-disease/class_names.json?v=${OFFLINE_MODEL_VERSION}`;
// model.json + class names + weight shard for mobile model.
const MODEL_DOWNLOAD_BYTES = 2_351_870;

async function responseSize(response) {
    const headerSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(headerSize) && headerSize > 0) return headerSize;
    return (await response.clone().arrayBuffer()).byteLength;
}

function cleanHeaders(sourceHeaders, byteLength) {
    const headers = new Headers(sourceHeaders);
    headers.delete("content-encoding");
    headers.delete("transfer-encoding");
    headers.set("content-length", String(byteLength));
    return headers;
}

function cacheBustedUrl(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}offline-version=${OFFLINE_MODEL_VERSION}`;
}

function storedResponse(body, sourceHeaders, byteLength) {
    return new Response(body, {
        status: 200,
        statusText: "OK",
        headers: cleanHeaders(sourceHeaders, byteLength),
    });
}

async function cacheWithProgress(cache, url, progress) {
    const existing = await cache.match(url);
    if (existing) {
        const size = await responseSize(existing);
        if (existing.status === 200 && size > 0) {
            progress.add(size);
            return existing;
        }
        await cache.delete(url);
    }

    const response = await fetch(cacheBustedUrl(url), { cache: "reload" });
    if (!response.ok || response.status !== 200) {
        throw new Error(`Download failed for ${url} (HTTP ${response.status})`);
    }

    if (!response.body) {
        const buffer = await response.arrayBuffer();
        progress.add(buffer.byteLength);
        if (buffer.byteLength === 0) throw new Error(`Downloaded file is empty: ${url}`);
        const cachedResponse = storedResponse(buffer, response.headers, buffer.byteLength);
        await cache.put(url, cachedResponse.clone());
        return cachedResponse;
    }

    const reader = response.body.getReader();
    const chunks = [];

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        progress.add(value.byteLength);
    }

    const blob = new Blob(chunks);
    if (blob.size === 0) throw new Error(`Downloaded file is empty: ${url}`);
    const cachedResponse = storedResponse(blob, response.headers, blob.size);
    await cache.put(url, cachedResponse.clone());
    return cachedResponse;
}

export async function downloadOfflineAssets(onProgress) {
    if (!("caches" in window)) {
        throw new Error("Offline storage is not supported by this browser");
    }

    const cache = await caches.open(CACHE_NAME);

    // Fetch the small manifest first so the installer follows its shard list.
    const manifestResponse = await fetch(cacheBustedUrl(MODEL_URL), { cache: "reload" });
    if (!manifestResponse.ok || manifestResponse.status !== 200) {
        throw new Error(`Model manifest download failed (HTTP ${manifestResponse.status})`);
    }
    const manifestBuffer = await manifestResponse.arrayBuffer();
    const manifest = JSON.parse(new TextDecoder().decode(manifestBuffer));
    await cache.put(
        MODEL_URL,
        storedResponse(manifestBuffer, manifestResponse.headers, manifestBuffer.byteLength)
    );

    const shardPaths = (manifest.weightsManifest || [])
        .flatMap((group) => group.paths || [])
        .map((path) => `/models/plant-disease/${path}`);
    
    // Also include legacy /model/ path so both resolve smoothly
    const alternateShardPaths = (manifest.weightsManifest || [])
        .flatMap((group) => group.paths || [])
        .map((path) => `/model/${path}`);

    const assetUrls = [CLASS_NAMES_URL, `/models/plant-disease/model.json`, ...shardPaths, ...alternateShardPaths];

    let downloadedBytes = manifestBuffer.byteLength;
    const report = () => onProgress?.(
        Math.min(downloadedBytes / MODEL_DOWNLOAD_BYTES, 0.90)
    );
    const progress = {
        add(bytes) {
            downloadedBytes += bytes;
            report();
        },
    };
    report();

    for (const url of assetUrls) {
        try {
            await cacheWithProgress(cache, url, progress);
        } catch (e) {
            console.warn(`Optional cache asset download skipped: ${url}`, e.message);
        }
    }

    // Cache un-busted model.json as well
    await cache.put(
        `/models/plant-disease/model.json`,
        storedResponse(manifestBuffer, manifestResponse.headers, manifestBuffer.byteLength)
    );

    let classNames = null;
    const classResponse = await cache.match(CLASS_NAMES_URL) || await cache.match(`/models/plant-disease/class_names.json`);
    if (classResponse) {
        try {
            classNames = await classResponse.json();
            localStorage.setItem("agrigrow_class_names", JSON.stringify(classNames));
        } catch (e) {}
    }

    localStorage.setItem(OFFLINE_MODEL_VERSION_KEY, OFFLINE_MODEL_VERSION);
    onProgress?.(0.95);

    // Compile and persist model into IndexedDB immediately
    try {
        const { loadOfflineModel } = await import("./offlineModel");
        await loadOfflineModel();
    } catch (compileErr) {
        console.warn("⚠️ [OFFLINE INSTALLER] Initial compile note:", compileErr.message);
    }

    onProgress?.(1);
}
