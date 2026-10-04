

# 🌾 AgriGrow — Full System Review: UI/UX, Security & Backend

An in-depth review and technical audit was conducted across the **AgriGrow** codebase ([client](file:///d:/model/client), [server](file:///d:/model/server), and [ml-service](file:///d:/model/ml-service)).

---

## 📊 Executive Scorecard

| Domain | Score | Status | Key Highlights |
| :--- | :---: | :---: | :--- |
| **Security** | **5.5 / 10** | ⚠️ **Action Required** | Critical privilege escalation on registration, public IDOR in notifications, DoS disk fill risk via public uploads, client-side token duplication in `localStorage`. |
| **Backend Architecture** | **7.5 / 10** | 🟢 **Good / Solid** | Strong layered controller pattern, Mongoose schemas with indexes, circuit breaker for ML service, Winston logging, and Joi validation. Duplicate data models (`Farm` vs `GeoField`). |
| **UI/UX & Frontend** | **7.8 / 10** | 🟢 **Polished & Modern** | Premium dark aesthetic, smooth ambient glow animations, offline-first PWA with TF.js fallback, RTL support. Monolithic dashboard file (`Dashboard.jsx`, 1590 lines) and uneven i18n coverage. |

---

## 🔐 1. Security Audit & Vulnerability Assessment

### 🚨 Critical Severity

#### 1. Unrestricted Privilege Escalation to Admin during Registration
* **Locations**: [authSchemas.js](file:///d:/model/server/validators/authSchemas.js#L92-L97), [authController.js](file:///d:/model/server/controllers/authController.js#L130-L148)
* **The Vulnerability**:
  The Joi schema explicitly allows `role` to be `"admin"`:
  ```javascript
  // authSchemas.js
  role: Joi.string()
      .valid("farmer", "admin")
      .default("farmer")
  ```
  And [authController.js](file:///d:/model/server/controllers/authController.js#L146) assigns `role: role || "farmer"` directly upon user creation.
* **Impact**:
  Any user can register with `{"email": "attacker@agrigrow.com", "password": "...", "confirmPassword": "...", "role": "admin"}` and immediately gain access to the Admin Dashboard, user management, and moderation controls.
* **Remediation**:
  Hardcode `role: "farmer"` on registration. Admin accounts should only be provisioned via database seed scripts or by an existing admin.

---

#### 2. Information Disclosure & Insecure Direct Object Reference (IDOR) on Notifications
* **Location**: [blogController.js](file:///d:/model/server/controllers/blogController.js#L186-L194)
* **The Vulnerability**:
  ```javascript
  const getNotifications = asyncHandler(async (req, res) => {
      const filter = {};
      if (req.user?._id) filter.user = req.user._id;
      else if (req.query.email) filter.recipientEmail = String(req.query.email).toLowerCase();
      else return sendSuccess(res, 200, "Notifications retrieved", { notifications: [] });

      const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50).lean();
      sendSuccess(res, 200, "Notifications retrieved", { notifications });
  });
  ```
* **Impact**:
  Any unauthenticated actor can query `GET /api/blog/notifications?email=target@example.com` and inspect private user notifications (moderation alerts, blog rejection feedback, etc.). Furthermore, in [markNotificationRead](file:///d:/model/server/controllers/blogController.js#L196-L206), if `req.user` is undefined, the authorization check is bypassed entirely, allowing arbitrary users to mark notifications as read.
* **Remediation**:
  Make `/api/blog/notifications` strictly authenticated (`protect` middleware) and filter solely by `req.user._id`.

---

### ⚠️ High Severity

#### 3. Unauthenticated Storage Exhaustion (Disk Denial of Service)
* **Location**: [diseaseRoutes.js](file:///d:/model/server/routes/diseaseRoutes.js#L80-L87), [diseaseController.js](file:///d:/model/server/controllers/diseaseController.js#L218-L248)
* **The Vulnerability**:
  `/api/disease/detect` is public (`optionalAuth`) and accepts up to 10 MB per image. When an unauthenticated guest uploads a photo, Multer writes it to `server/uploads/disease/`. If the prediction succeeds, no database record is created (`record = null`), but the file is **never deleted**.
* **Impact**:
  An automated script sending repeated 10 MB uploads can fill up the host drive in minutes, causing the Node.js server, MongoDB, and ML service to crash.
* **Remediation**:
  If `!isLoggedIn`, schedule or immediately trigger `deleteUploadedFile(imagePath)` after inference finishes. Add strict rate-limiting per IP on image uploads (e.g. 10 scans / 10 min for guests).

---

#### 4. Shared Demo User Collision in Precision Agriculture Dashboard
* **Location**: [dashboardRoutes.js](file:///d:/model/server/routes/dashboardRoutes.js#L68-L73)
* **The Vulnerability**:
  In `dashboardRoutes.js`, an ad-hoc `optionalAuth` sets `req.user = { _id: "000000000000000000000000" }` for all unauthenticated users.
* **Impact**:
  Every guest shares the exact same user ID in the database. When Guest A draws and saves a farm polygon, Guest B opens the dashboard, sees Guest A's farm, and can delete it via `DELETE /api/dashboard/fields/:id`.
* **Remediation**:
  Store guest field polygons client-side in `IndexedDB` or `localStorage` (similar to offline scans). Only persist to MongoDB when the user is logged in.

---

### 🟡 Medium & Low Severity

#### 5. Dual JWT Storage: Storing Token in `localStorage` alongside `httpOnly` Cookie
* **Location**: [AuthContext.jsx](file:///d:/model/client/src/context/AuthContext.jsx#L51-L55), [authController.js](file:///d:/model/server/controllers/authController.js#L98-L107)
* **The Vulnerability**:
  The server correctly sets an `httpOnly`, `sameSite: strict` cookie, but also returns the JWT token in the JSON response body. The client stores it in `localStorage.setItem("agrigrow_token", t)`.
* **Impact**:
  Storing tokens in `localStorage` makes them accessible to JavaScript, exposing the session to exfiltration in the event of any Cross-Site Scripting (XSS) vulnerability or compromised third-party script.
* **Remediation**:
  Rely exclusively on `httpOnly` cookies with credentials included, removing token storage from `localStorage`.

#### 6. Missing Magic Bytes Verification on Profile Avatar Uploads
* **Location**: [authRoutes.js](file:///d:/model/server/routes/authRoutes.js#L126-L131)
* **The Vulnerability**:
  While `/api/disease/detect` chains `validateUploadedFile` (magic byte header inspection), `POST /api/auth/profile/avatar` omits `validateUploadedFile` and `handleMulterError`.
* **Impact**:
  Spoofed files (e.g., polyglot files or disguised executables) can be uploaded to `/uploads/profiles/`.
* **Remediation**:
  Add `handleMulterError` and `validateUploadedFile` to `router.post("/profile/avatar", protect, uploadProfile.single("avatar"), handleMulterError, validateUploadedFile, uploadAvatar)`.

#### 7. Unrestricted Guest Voting Inflation
* **Location**: [forumController.js](file:///d:/model/server/controllers/forumController.js#L144-L146)
* **The Vulnerability**:
  In `upvoteThread` and `upvoteReply`, if `!req.user`, the handler simply increments `thread.guestUpvoteCount += 1`.
* **Impact**:
  Anyone can send thousands of requests in a loop to artificially manipulate vote counts.
* **Remediation**:
  Require authentication for voting, or restrict guest votes using signed client cookies/fingerprints and rate limiting.

#### 8. Plaintext HTTP Scraper Endpoint
* **Location**: [marketPriceScraper.js](file:///d:/model/server/services/marketPriceScraper.js#L28)
* **The Vulnerability**:
  `SCRAPER_URL = "http://www.amis.pk/daily%20market%20changes.aspx"` runs over plaintext HTTP without SSL/TLS integrity verification.
* **Remediation**:
  Switch to `https://` if supported, or implement response signature/checksum verification.

---

## ⚙️ 2. Backend & Architecture Review

### Architecture Overview
```
┌─────────────────┐       ┌─────────────────┐       ┌────────────────────────┐
│  React (Vite)   │ ────► │  Node Express   │ ────► │  Python FastAPI (ML)   │
│  Port 3000      │       │  Port 5000      │       │  Port 8000             │
└─────────────────┘       └────────┬────────┘       │  • MobileNetV2 (ONNX)  │
                                   │                └────────────────────────┘
                          ┌────────▼────────┐       ┌────────────────────────┐
                          │    MongoDB      │       │  Google Gemini 2.5     │
                          │    Mongoose     │       │  (AI Advisory)         │
                          └─────────────────┘       └────────────────────────┘
```

### Strengths
1. **Defensive Hardening**:
   - Helmet headers, `mongoSanitize()`, `hpp()`, and Winston structured logging configured in [server.js](file:///d:/model/server/server.js#L72-L120).
2. **Reliable ML Integration**:
   - [mlService.js](file:///d:/model/server/services/mlService.js) features an exponential backoff retry mechanism and circuit breaker to prevent cascading failures when the Python process is warming up.
3. **Optimized ONNX Runtime**:
   - [app.py](file:///d:/model/ml-service/app.py) uses ONNX Runtime (`mobilenet_v2_47_classes.onnx`) rather than heavy TensorFlow weights, resulting in <100ms inference times with minimal memory footprint.

### Deficiencies & Architectural Bottlenecks

#### 1. Dual Parallel Data Models (`Farm` vs `GeoField`)
* **The Problem**:
  The application maintains two independent schemas for land:
  - [Farm.js](file:///d:/model/server/models/Farm.js) (fields: `crops`, `cropHistory`, `soilType`, `location`).
  - [GeoField.js](file:///d:/model/server/models/GeoField.js) (fields: `boundary`, `centroid`, `weatherSnapshot`, `recommendation`).
* **Consequence**:
  A field mapped on the Dashboard is saved to `GeoField`, but does not appear in the user's `Farm` list or Farm Statistics. This leads to duplicate code, divergent controllers, and user confusion.
* **Recommendation**:
  Consolidate into a single hierarchical schema where a `Farm` owns one or more `Field` sub-documents.

#### 2. Global Blocking AI Throttle
* **Location**: [geminiService.js](file:///d:/model/server/services/geminiService.js#L110-L124)
* **The Problem**:
  ```javascript
  const throttleState = {
      lastRequestTime: 0,
      minIntervalMs: 15000, // 15 seconds!
  };
  ```
  This in-memory throttle causes requests to wait sequentially in a `sleep()` loop. If 4 concurrent users request disease diagnosis or AI advisory, the 4th user waits 45–60 seconds, which frequently triggers frontend fetch timeouts or proxy drops.
* **Recommendation**:
  Remove synchronous thread sleep throttling. Rely on asynchronous job queues (e.g. BullMQ / Redis) or standard HTTP 429 backoff handling.

#### 3. Database Auto-Seeding Triggered on Client GET Requests
* **Location**: [marketPriceController.js](file:///d:/model/server/controllers/marketPriceController.js#L107-L108)
* **The Problem**:
  `await seedSampleDataIfEmpty()` is invoked inside every public `GET` endpoint (`/prices`, `/prices/latest`, `/crops`, `/mandis`).
* **Recommendation**:
  Remove runtime seed checks from API routes. Run database seeding strictly during server bootstrap or via `npm run seed`.

#### 4. Missing Vite Dev Proxy for Uploaded Media
* **Location**: [vite.config.js](file:///d:/model/client/vite.config.js#L71-L74)
* **The Problem**:
  `vite.config.js` only proxies `/api` to `http://localhost:5000`. It does not proxy `/uploads`.
* **Consequence**:
  During local development (`npm run dev`), uploaded leaf images (`/uploads/disease/...`) and user avatars (`/uploads/profiles/...`) return 404 from Vite's dev server.
* **Fix**:
  Add `"/uploads": "http://localhost:5000"` to `vite.config.js`.

---

## 🎨 3. UI/UX & Frontend Audit

### Strengths
1. **Visual Atmosphere & Modern Palette**:
   - The dark palette (`#030712`), tailored accent colors (`#10b981`), ambient floating gradient blobs, and glassmorphic cards create a sleek, high-tech agricultural feel.
2. **True Offline-First Resilience**:
   - The app provides an IndexedDB offline storage layer ([offlineStorage.js](file:///d:/model/client/src/offlineStorage.js)), service worker caching, and an in-browser TF.js fallback model. If the backend or connectivity drops, farmers can still perform leaf scans.
3. **Multilingual & RTL Consideration**:
   - Native support for English (`en`), Urdu (`ur`), and Punjabi (`pa`) with dynamic font switching (`Noto Nastaliq Urdu`) and RTL text alignment.

### UI/UX Flaws & Improvement Areas

#### 1. Monolithic Component: `Dashboard.jsx` (1,590 Lines)
* **Issue**:
  [Dashboard.jsx](file:///d:/model/client/src/Dashboard.jsx) handles Leaflet map initialization, Nominatim geocoding, polygon drawing, weather forecasting, disease scanning, AI crop advisory, and form inputs all in one component.
* **User Impact**:
  Updating search or drawing a vertex causes the entire 1590-line component tree to re-evaluate, resulting in UI micro-stutters.
* **Fix**:
  Decompose into modular subcomponents:
  - `<FieldMapView />` (Map, tiles, polygon drawing)
  - `<WeatherWidget />` (Current weather & 5-day forecast)
  - `<CropAdvisoryPanel />` (AI recommendations & suitability)
  - `<SavedFieldsDrawer />` (Saved fields list & statistics)

#### 2. Leaflet Search Popup XSS Vector
* **Location**: [Dashboard.jsx](file:///d:/model/client/src/Dashboard.jsx#L360-L364)
* **Issue**:
  Unsanitized search text is interpolated into an HTML string passed to Leaflet:
  ```javascript
  .bindPopup(`<div ...><strong>${result.display_name?.split(",").slice(0, 3).join(", ")}</strong></div>`)
  ```
* **Fix**:
  Use DOM text nodes or sanitize strings before rendering them inside map popups.

#### 3. Broken / Dead-End Navigation in Bookmarks
* **Location**: [Bookmarks.jsx](file:///d:/model/client/src/pages/Bookmarks.jsx#L110-L158)
* **Issue**:
  The Bookmarks view renders cards for saved articles, advisories, and questions, but the cards **lack navigation links**. The user cannot click on an article to read the full post or view the Q&A thread.
* **Fix**:
  Wrap card headers in `<Link to={`/community/${item.slug}`}>` and `<Link to={`/qa/${item._id}`}>`.

#### 4. Hardcoded English Strings Across Translated Views
* **Issue**:
  While [LanguageContext.jsx](file:///d:/model/client/src/context/LanguageContext.jsx) exists, several pages ([AdminDashboard.jsx](file:///d:/model/client/src/pages/AdminDashboard.jsx), [Community.jsx](file:///d:/model/client/src/Community.jsx), and parts of [CropCalendar.jsx](file:///d:/model/client/src/pages/CropCalendar.jsx)) have hardcoded English text and do not invoke `t()`.
* **Fix**:
  Extract all strings to `en.json`, `ur.json`, and `pa.json`.

#### 5. Broken Offline Navbar Avatar
* **Location**: [Navbar.jsx](file:///d:/model/client/src/components/Navbar.jsx#L84)
* **Issue**:
  When a user has no uploaded avatar, the navbar loads a remote image from Unsplash:
  ```javascript
  src={user?.avatar || "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?..."}
  ```
  In an offline farming scenario, this causes broken image icons.
* **Fix**:
  Use an inline SVG or a bundled local avatar asset.

#### 6. Role-Guarded Client Routes
* **Location**: [ProtectedRoute.jsx](file:///d:/model/client/src/components/ProtectedRoute.jsx#L4-L40), [App.jsx](file:///d:/model/client/src/App.jsx#L215-L221)
* **Issue**:
  `<ProtectedRoute>` only verifies `isAuthenticated`. Any logged-in farmer who navigates to `/admin` can view the admin layout (where API calls then fail with 403 errors).
* **Fix**:
  Add role support:
  ```jsx
  <ProtectedRoute requiredRole="admin">
      <AdminDashboard />
  </ProtectedRoute>
  ```

---

## 🛠️ 4. Recommended Action Plan & Priority Matrix

```
       HIGH IMPACT
            ▲
            │  [1. Fix Register Role]    [3. Consolidate Farm/Field]
            │  [2. Secure Notifications] [4. Fix Uploads Proxy]
            │  [5. Disk DoS Cleanup]
            │
            │  [6. Decompose Dashboard]  [8. Link Bookmarks]
            │  [7. Remove AI Throttle]   [9. Complete i18n]
            │
            └────────────────────────────────────────────────► HIGH EFFORT
```

### Phase 1: Immediate Security & Stability Hotfixes
1. **Restrict User Registration**: Remove `role: "admin"` from [authSchemas.js](file:///d:/model/server/validators/authSchemas.js).
2. **Lock Down Notifications**: Ensure `/api/blog/notifications` requires JWT authentication and only returns notifications for `req.user._id`.
3. **Prevent Storage Depletion**: In [diseaseController.js](file:///d:/model/server/controllers/diseaseController.js), delete uploaded images for guest scans once inference completes.
4. **Vite Proxy Config**: Add `"/uploads": "http://localhost:5000"` to [vite.config.js](file:///d:/model/client/vite.config.js).

### Phase 2: Architecture & Performance
1. **Unify Farm and Field Models**: Merge [Farm.js](file:///d:/model/server/models/Farm.js) and [GeoField.js](file:///d:/model/server/models/GeoField.js) into a coherent schema.
2. **Optimize AI Request Handling**: Replace the 15-second synchronous sleep in [geminiService.js](file:///d:/model/server/services/geminiService.js) with non-blocking rate limiting.
3. **Move Seed Logic to Boot Time**: Remove `seedSampleDataIfEmpty()` from request handlers in [marketPriceController.js](file:///d:/model/server/controllers/marketPriceController.js).

### Phase 3: UI/UX & Quality of Life
1. **Component Refactoring**: Split [Dashboard.jsx](file:///d:/model/client/src/Dashboard.jsx) into modular subcomponents.
2. **Interactive Bookmarks**: Add navigation links to bookmarked items in [Bookmarks.jsx](file:///d:/model/client/src/pages/Bookmarks.jsx).
3. **Enforce Role-Based Route Guards**: Update [ProtectedRoute.jsx](file:///d:/model/client/src/components/ProtectedRoute.jsx) to redirect non-admin users away from `/admin`.
4. **Bundled Offline Avatars**: Replace external Unsplash default image URLs with local SVG icons.