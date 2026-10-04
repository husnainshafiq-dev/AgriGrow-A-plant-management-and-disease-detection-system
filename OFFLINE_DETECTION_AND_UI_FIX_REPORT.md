# AgriGrow: Offline Detection & UI Overlap Bug Fix Report

**Date:** October 4, 2026  
**Repository:** [husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system](https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system)  
**Target Environments:** Vercel (Frontend PWA) & Render (Node API & Python FastAPI ML)  
**Latest Fix Commit:** [`8d2fc6a`](https://github.com/husnainshafiq-dev/AgriGrow-A-plant-management-and-disease-detection-system/commit/8d2fc6a)

---

## 1. Executive Summary

This report documents the investigation, root-cause diagnosis, and resolution for two critical issues observed in the AgriGrow application:

1. **Offline Inference Failure**: When disconnected from the internet, clicking **"ANALYSE LEAF"** resulted in the red error banner:  
   `"Browser disease model could not load. Please refresh once and try again."` even after the user had previously downloaded the offline detector.
2. **Sticky Navigation Bleed-Through & Overlap**: As the user scrolled down the page, glowing hero buttons (`DETECTOR`, `Dashboard`, `Calendar`, `Expert Q&A`) visibly shone directly through and collided with the sticky top navigation bar.
3. **Backend Connection Availability Status**: Explanation and resolution for the indicator pill:  
   `"Backend connection unavailable; browser detection will be used."`

---

## 2. Issue 1: Offline Model Loading Failure

### 2.1 Symptoms
- While connected to the internet, downloading the offline model reported successful installation ("Offline detector ready").
- Once the user disconnected from Wi-Fi / went offline, selecting an image and clicking **"ANALYSE LEAF"** failed immediately.
- The UI displayed:  
  `Browser disease model could not load. Please refresh once and try again.`

### 2.2 Root Cause Analysis
A deep investigation into `offlineInstaller.js` and `offlineModel.js` revealed four interconnected problems:

| # | Component | Root Cause |
|---|---|---|
| **A** | **Storage Target Discrepancy** | `downloadOfflineAssets` in `offlineInstaller.js` saved raw HTTP response streams into the browser's Cache Storage (`caches.open("tfjs-model-cache")`). However, TensorFlow.js in `offlineModel.js` looked exclusively inside **IndexedDB** (`tf.loadGraphModel("indexeddb://plant-disease-model")`). Because IndexedDB was never populated, the load was considered a cache miss. |
| **B** | **Path Mismatch for Weight Shards** | In `offlineInstaller.js`, weight shards were constructed using `/model/${path}` (`/model/group1-shard1of1.bin`), whereas the actual model manifest declared `/models/plant-disease/group1-shard1of1.bin`. When TensorFlow.js resolved relative shards from `/models/plant-disease/model.json`, the Cache API returned a 404 miss. |
| **C** | **Forced Network Fetch While Offline** | Upon an IndexedDB miss, `offlineModel.js` fell back to network fetching with `fetchOptions: { cache: "no-cache" }`. Because the device was offline, `no-cache` prohibited the browser from using cached responses, causing `fetch` to reject immediately with a network error. |
| **D** | **Class Labels Dependency** | If `class_names.json` could not be fetched or parsed from local storage while offline, `isModelLoaded()` returned `false` due to an empty classes array, prematurely aborting prediction. |

### 2.3 Implementation Fix

1. **Dual-Layer Auto-Recovery in `client/src/offlineModel.js`**:
   - Implemented `customModelFetch`: If IndexedDB does not yet contain the model, it queries the browser Cache API directly. It checks:
     - Exact URL matches (with and without query params)
     - Clean path matches (`/models/plant-disease/model.json`)
     - Filename matches (e.g. `group1-shard1of1.bin`)
   - This ensures that even if files were cached under slightly different directory prefixes, TensorFlow.js successfully extracts them completely offline.
   - Once loaded, `networkModel.save("indexeddb://plant-disease-model")` is invoked immediately, ensuring permanent IndexedDB persistence for all subsequent offline launches.

2. **Synchronized `client/src/offlineInstaller.js`**:
   - Updated `downloadOfflineAssets` to cache both `/models/plant-disease/` and legacy `/model/` paths.
   - Integrated immediate model compilation into IndexedDB during the download process so the model is ready in memory and IndexedDB before the user ever goes offline.

3. **Embedded 47-Class Fallback Matrix**:
   - Exported `FALLBACK_CLASS_NAMES` directly within `offlineModel.js` containing all 47 classes in exact model output index order. If local storage or network class manifests are unavailable, inference never crashes.

4. **Service Worker Regex Extension in `client/vite.config.js`**:
   - Expanded Workbox `runtimeCaching` rule from `/\/model\/.*/i` to `/\/models?\/.*/i` to cache all static model files for 30 days.

---

## 3. Issue 2: Navbar Bleed-Through & Overlap

### 3.1 Symptoms
- When scrolling past the hero section, the buttons (`DETECTOR`, `Dashboard`, `Calendar`, `Expert Q&A`) remained visible behind the sticky navbar links, creating overlapping and unreadable text.
- On medium desktop displays, the logo text ("AgriGrow") and the first link ("Detector") ran close together ("AgriGrowDetector").

### 3.2 Root Cause Analysis
- In `client/src/index.css`, `.glass-panel` specified:
  ```css
  background: var(--surface); /* rgba(15, 23, 42, 0.45) - 45% opacity */
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  ```
- Because `.navbar` inherited `.glass-panel` with no backdrop blur and high transparency, any elements scrolling underneath were 100% visible through the bar.
- `.nav-container` lacked an explicit flex `gap`, allowing items to compress when horizontal room was tight.

### 3.3 Implementation Fix
Updated `client/src/components/Navbar.css`:
```css
.navbar {
    position: sticky;
    top: 0;
    left: 0;
    right: 0;
    z-index: 1000;
    margin: 8px 16px;
    border-radius: 16px;
    padding: 10px 20px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(10, 15, 26, 0.96) !important;
    backdrop-filter: blur(20px) !important;
    -webkit-backdrop-filter: blur(20px) !important;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6) !important;
}

.nav-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    width: 100%;
    gap: 20px;
}
```

---

## 4. Issue 3: Backend Status Pill (`"Backend connection unavailable..."`)

### 4.1 Explanation
The application features a hybrid AI architecture:
- **Cloud Microservice Mode**: Node.js backend routes image inference to a FastAPI Python container with ONNX Runtime (`/api/disease/detect`).
- **Edge / Browser Mode**: Client runs MobileNetV2 directly inside the browser using TensorFlow.js and WebGL/WASM.

When the badge displays:
`"Backend connection unavailable; browser detection will be used."` (or `"Online detector unavailable..."`)
- The Render free-tier container may be temporarily spinning up from cold sleep (takes ~50 seconds), or `ML_SERVICE_URL` on the Node service returned HTTP 502.
- The frontend automatically transitions to **Browser Detection mode**, ensuring uninterrupted user operation without requiring server uptime.

---

## 5. Verification & Testing Checklist

| Test Case | Procedure | Expected Result | Status |
|---|---|---|---|
| **1. Online Build** | Run `npm run build` in `client/` | Clean build with PWA service worker generated | ✅ PASSED |
| **2. One-Time Download** | Click **"Save for offline"** while connected | Progress bar fills to 100%; IndexedDB `plant-disease-model` and Cache Storage populated | ✅ VERIFIED |
| **3. Offline Inference** | Disconnect network (airplane mode / disable Wi-Fi); upload leaf image and click **"ANALYSE LEAF"** | Model initializes from IndexedDB / Cache API; diagnosis and treatment recommendations appear without network errors | ✅ VERIFIED |
| **4. Sticky Navbar Scroll** | Scroll down page past hero buttons | Navbar remains opaque (`rgba(10, 15, 26, 0.96)`); hero buttons slide cleanly underneath without bleeding through | ✅ VERIFIED |
| **5. Navigation Spacing** | View on standard and medium desktop screens | Clear gap between brand logo and navigation items | ✅ VERIFIED |

---

## 6. Files Modified

- [`client/src/offlineModel.js`](file:///d:/model/client/src/offlineModel.js): Implemented `customModelFetch`, IndexedDB auto-recovery, and embedded 47-class definitions.
- [`client/src/offlineInstaller.js`](file:///d:/model/client/src/offlineInstaller.js): Synchronized cache URLs, corrected weight shard paths, and added automatic IndexedDB compilation on install.
- [`client/vite.config.js`](file:///d:/model/client/vite.config.js): Extended PWA Workbox cache matching regex for all model resources.
- [`client/src/components/Navbar.css`](file:///d:/model/client/src/components/Navbar.css): Enhanced navbar opacity and container spacing.
