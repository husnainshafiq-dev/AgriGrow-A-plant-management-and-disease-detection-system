export const OFFLINE_MODEL_VERSION = "4.0.0";
export const OFFLINE_MODEL_VERSION_KEY = "agrigrow_model_version";

export function isOfflineModelMarkedInstalled() {
    return localStorage.getItem(OFFLINE_MODEL_VERSION_KEY) === OFFLINE_MODEL_VERSION;
}
