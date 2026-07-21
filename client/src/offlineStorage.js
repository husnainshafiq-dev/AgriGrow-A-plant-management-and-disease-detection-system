/**
 * Offline Storage — IndexedDB for scan history
 *
 * Stores disease detection results locally when the user is offline.
 * When connectivity is restored, unsynced scans can be pushed to the server.
 */

const DB_NAME = "AgriGrowOffline";
const DB_VERSION = 1;
const STORE_NAME = "scans";

/**
 * Open (or create) the IndexedDB database.
 */
function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, {
                    keyPath: "id",
                    autoIncrement: true,
                });
                store.createIndex("synced", "synced", { unique: false });
                store.createIndex("timestamp", "timestamp", { unique: false });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Save a scan result to IndexedDB.
 *
 * @param {Object} scanData — prediction result from offline or online inference
 * @param {string|null} imageData — base64 data URL of the scanned image (optional)
 */
export async function saveOfflineScan(scanData, imageData = null) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    const record = {
        ...scanData,
        imageData,
        timestamp: new Date().toISOString(),
        synced: false,
    };

    return new Promise((resolve, reject) => {
        const req = store.add(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get all scan records from IndexedDB.
 */
export async function getAllScans() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

/**
 * Get all unsynced scan records.
 */
export async function getUnsyncedScans() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("synced");

    return new Promise((resolve) => {
        const req = index.getAll(false);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });
}

/**
 * Mark a scan as synced.
 *
 * @param {number} id — IndexedDB record ID
 */
export async function markAsSynced(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const record = getReq.result;
            if (record) {
                record.synced = true;
                const putReq = store.put(record);
                putReq.onsuccess = () => resolve(true);
                putReq.onerror = () => reject(putReq.error);
            } else {
                resolve(false);
            }
        };
        getReq.onerror = () => reject(getReq.error);
    });
}

/**
 * Sync all unsynced scans to the server.
 * Call this when the app detects it has come back online.
 *
 * @returns {number} number of successfully synced records
 */
export async function syncToServer() {
    const unsynced = await getUnsyncedScans();
    let syncedCount = 0;

    for (const scan of unsynced) {
        try {
            const res = await fetch("/api/disease/sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    prediction: scan.prediction,
                    confidence: scan.confidence,
                    is_healthy: scan.is_healthy,
                    isHealthy: scan.isHealthy,
                    description: scan.description,
                    recommendation: scan.recommendation,
                    top_predictions: scan.top_predictions,
                    topPredictions: scan.topPredictions,
                    timestamp: scan.timestamp,
                    offline: true,
                }),
            });

            if (res.ok) {
                await markAsSynced(scan.id);
                syncedCount++;
            }
        } catch {
            // Server unreachable again — stop trying
            break;
        }
    }

    if (syncedCount > 0) {
        console.log(`✅ Synced ${syncedCount} offline scan(s) to server`);
    }

    return syncedCount;
}

/**
 * Delete a specific scan by ID.
 */
export async function deleteScan(id) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Get total count of scans.
 */
export async function getScanCount() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve) => {
        const req = store.count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(0);
    });
}
