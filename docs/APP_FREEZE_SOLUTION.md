# App Freeze Solution

## Problem

The app was responsive for a short moment after loading, then it became stuck and buttons stopped responding.

## Root Cause

The freeze was not caused by the buttons themselves. The app was automatically loading the offline TensorFlow.js disease-detection model shortly after startup.

That startup flow was in `client/src/App.jsx`:

- the page loaded normally
- after a short delay, `warmOfflineModel` ran
- `warmOfflineModel` imported `client/src/offlineModel.js`
- that imported TensorFlow.js and started loading the browser model
- the browser main thread became busy, so the UI appeared frozen

There was also a related service-worker/cache risk from the PWA setup. If an older service worker was still active in the browser, it could keep serving stale files during development.

A second performance risk was the heavy visual layer: large blurred animated background blobs plus stacked `backdrop-filter` panels. On some machines those effects can make the page feel stuck even when JavaScript is not broken.

## Fix Applied

### 1. Stopped automatic offline model loading

`client/src/App.jsx` no longer preloads the offline TensorFlow model after startup.

The app now only checks backend health on startup. The offline model loads only when the user actually needs offline prediction.

### 2. Kept offline detection available

`client/src/pages/Home.jsx` still loads `offlineModel.js`, but only inside the offline prediction path.

That means normal page navigation, buttons, blog, forum, dashboard links, and forms stay responsive.

### 3. Cleared stale development service workers

`client/index.html` performs an early localhost cleanup before React starts.

`client/src/main.jsx` also unregisters service workers and clears browser caches in development mode.

This prevents an old PWA service worker from serving stale files while testing on localhost.

### 4. Removed heavy startup visual effects

`client/src/index.css`, `client/src/Dashboard.css`, `client/src/FarmMap.css`, `client/src/PrecisionMap.css`, and `client/src/App.css` now avoid expensive backdrop filters.

`client/src/App.css` reduces the blurred background blobs and stops their animation, which keeps the main page lighter and more responsive.

### 5. Fixed the normal dev command

`npm run dev` now starts the web app only:

- backend API
- frontend app

The ML service is now separate because this machine currently does not have a working Python installation.

Use this only after Python is installed again:

```bash
npm run dev:full
```

## How To Run The App

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

If the browser still shows the old stuck version, do one hard refresh:

```text
Ctrl + Shift + R
```

## Important Note

Server-side Python disease detection still requires the Python ML service, but the app now falls back to browser-based detection when that service is down. The main web app, blog, forum, pages, navigation, and buttons should stay responsive now.

## Disease Detection Service Fallback

A later issue showed this message during prediction:

```text
The disease detection service is not currently available. Please try again later or contact support.
```

That happens when the Python ML service on port `8000` is not running.

The app now handles that more gracefully:

- `client/src/pages/Home.jsx` checks `/api/health` before uploading the image.
- If the Python ML service is unavailable, it skips the backend prediction call.
- The app then loads the browser TensorFlow.js model from `client/public/model` and predicts locally.
- If the browser fallback produces a result while online, it also tries to sync the scan back to the backend.
- `server/services/mlService.js` uses a shorter health-check timeout so the fallback starts faster.

This means users can still get a disease prediction even when the separate Python service is down, as long as the browser model files are available.

## Online Detector Unavailable & Browser Fallback Silent Failures (July 2026)

### Problem 1: Online Detector Always Unavailable

When running the app with `npm run dev`, predictions always fell back to the browser model because the ML Python service (FastAPI on port 8000) was **never started**.

`npm run dev` only starts:

- ✅ Node.js Express server (port 5000)
- ✅ React Vite client (port 3000)
- ❌ Python ML service (port 8000) — **not started**

The health endpoint returned:

```json
{
  "status": "loading",
  "ml_service": { "status": "unavailable" }
}
```

`isOnlineDetectorReady()` in `client/src/pages/Home.jsx` checks for `status === "ready"` and `ml_service.status === "available"` — both failed, so it always printed "Online detector unavailable" and fell through to the browser fallback.

### Fix 1: Use `npm run dev:full`

Switched from `npm run dev` to `npm run dev:full`, which starts all 3 services via `concurrently`:

```bash
npm run dev:full
```

This runs:

| Service         | Port | Command                                    |
|-----------------|------|--------------------------------------------|
| ML (FastAPI)    | 8000 | `python -m uvicorn app:app --reload`       |
| Server (Express)| 5000 | `nodemon server.js`                        |
| Client (Vite)   | 3000 | `vite`                                     |

After this, the health endpoint returns:

```json
{
  "status": "ready",
  "ml_service": {
    "status": "healthy",
    "model_loaded": true,
    "classes_count": 28
  }
}
```

### Problem 2: Browser Fallback Failures Were Silent

When the online detector was unavailable, the code fell back to `handleOfflinePredict()` in `Home.jsx`, which dynamically imports `offlineModel.js` and tries to load a TensorFlow.js model in-browser.

All model files were verified correct:

- `client/public/model/model.json` — valid `weightsManifest` with 272 weights
- 3 `.bin` shard files (~10MB total) — all served with HTTP 200
- `client/public/model/class_names.json` — all 28 classes
- `@tensorflow/tfjs@^4.22.0` in client dependencies

But when the browser model failed, the only error shown was a generic `"Offline prediction failed"` toast — no details about **which step** failed or **why**.

### Fix 2: Added Detailed Diagnostic Logging

Enhanced `client/src/pages/Home.jsx` with two levels of logging:

**Health check logging** (`isOnlineDetectorReady`):

- Logs the full JSON response when the detector isn't ready
- Logs the HTTP status code on non-200 responses
- Logs fetch errors with the error message

All prefixed with `[HEALTH]` for easy filtering.

**Browser fallback logging** (`handleOfflinePredict`):

Logs a 5-step trace with timing at each stage:

1. `Step 1/5` — Importing the `offlineModel` module
2. `Step 2/5` — Loading the TF.js model into memory (or skipping if cached)
3. `Step 3/5` — Decoding the uploaded image (logs dimensions)
4. `Step 4/5` — Running TF.js inference (logs prediction + confidence)
5. `Step 5/5` — Saving scan to IndexedDB + sync attempt

On failure, logs both the error message **and** full stack trace.

All prefixed with `[BROWSER FALLBACK]` for easy filtering in DevTools Console.

### How To Diagnose Future Issues

1. Open browser DevTools → Console
2. Filter by `[HEALTH]` to see online detector status
3. Filter by `[BROWSER FALLBACK]` to see the step-by-step browser prediction trace
4. Filter by `[OFFLINE MODEL]` to see TF.js model loading details (from `offlineModel.js`)

## Dashboard Login Loop & Authentication Session Verification (July 2026)

### Problem: Redirect Loop Back to Login Page

When users logged in successfully (`POST /api/auth/login` returned HTTP 200), they were briefly redirected to `/dashboard` but immediately kicked back to the login page (`/login?redirect=%2Fdashboard`).

#### Root Cause 1: Malformed JWT in LocalStorage
The standard API responses return JSON in the structure:
`{ success: true, message: "...", data: { token: "...", user: { ... } } }`

In `client/src/context/AuthContext.jsx`, the login, registration, and password change methods were saving the token using `saveToken(data.token)`. Because `token` resides under `data.data`, `data.token` evaluated to `undefined`. This stored the literal string `"undefined"` into LocalStorage. When the app refreshed, the backend middleware tried to verify this malformed token and threw `JsonWebTokenError: jwt malformed`, clearing the auth state and redirecting the client back to the login page.

#### Root Cause 2: User Context Layout Mismatch
The `AuthContext` state was setting `user` to `data.data || data.user || data`. Since `data.data` contained both `token` and `user`, the state was populated with `{ token: "...", user: { ... } }` instead of the user profile object itself, causing `user.name` and other fields in pages like `Profile.jsx` to be undefined.

#### Root Cause 3: Guest Mode Fetching on Dashboard
The `Dashboard.jsx` component made `fetch` requests (for retrieving, saving, and deleting fields, or generating AI analyses) without sending the `Authorization` header. As a result, the backend `optionalAuth` middleware fell back to the mock Guest/Demo user ID, separating saved fields from the logged-in user's account.

---

### Fixes Applied

#### 1. Fixed JWT and User Parsing in AuthContext
Updated [AuthContext.jsx](file:///d:/model/client/src/context/AuthContext.jsx) to correctly parse standard backend response structures:
* Extracted token from `data.data.token` and user from `data.data.user` (with fallbacks).
* Prevents malformed `"undefined"` string values from being saved into the local storage.

#### 2. Added Authorization to Dashboard API requests
Updated [Dashboard.jsx](file:///d:/model/client/src/Dashboard.jsx) to include the JWT authorization header in all backend requests:
* Imported the `useAuth` context.
* Passed the authorization headers (`{ Authorization: 'Bearer <token>' }` via `authHeaders()`) to:
  * Fetch saved fields (`GET /api/dashboard/fields`)
  * Save a drawn field boundary (`POST /api/dashboard/fields`)
  * Delete a field (`DELETE /api/dashboard/fields/:id`)
  * Submit AI farm/crop analyses (`POST /api/dashboard/analyze/...`)
  * Upload a leaf image for scanning (`POST /api/dashboard/scan`)
This resolves the login loop and guarantees that fields are properly scoped and stored under the correct user account.

## False "Online" Status & True Internet Checking (July 2026)

### Problem: App Claimed "Online" Even When Disconnected

When testing the offline fallback mode by disconnecting from Wi-Fi (e.g., globe icon crossed out in the Windows Taskbar), the app still displayed the **"Online detection available"** badge. Because the frontend saw `isOnline` as `true` and successfully contacted the local backend (`localhost:5000`), the app continued to use the online service rather than switching to the offline browser model.

This occurred because `navigator.onLine` (which React uses to detect internet connection) is notoriously unreliable. In Chrome/Windows, it often evaluates to `true` even when there is no internet access (e.g., if connected to a local router with no WAN, or if a virtual network adapter like WSL is active).

### Fix Applied

Updated `client/src/App.jsx` to implement a **True Internet Check** to bypass the `navigator.onLine` bug. 

Instead of relying solely on the browser's built-in event listeners, the app now uses a `checkRealInternet` function that silently pings `https://www.google.com/favicon.ico` via a `no-cors` fetch. 

- If the fetch succeeds, the app is truly online.
- If the fetch fails, the app correctly sets `isOnline = false`, immediately hides the online status, and swaps the UI to show the **"Offline detector ready"** box.
- The check runs on mount, whenever the `online` event fires, and periodically every 10 seconds to catch lying browsers.