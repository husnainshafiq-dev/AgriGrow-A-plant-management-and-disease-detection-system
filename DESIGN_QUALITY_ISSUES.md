# Design Quality Issues

**Generated**: 2026-10-02
**Source**: Design documents in D:\model\docs
**Analysis Phase**: Phase 1 - Design Document Analysis

---

## Summary

- **Critical**: 4
- **Warning**: 7
- **Info**: 5

---

## CRITICAL (Implementation Blockers)

### [DQ-001] Unrestricted Privilege Escalation to Admin during Registration
**Severity**: CRITICAL
**Source**: docs/review.md, docs/API_REFERENCE.md
**Affected Endpoint**: POST /api/auth/register
**Affected Entity**: User

**Description**:
The Joi validation schema and registration controller allow users to register with `role: "admin"` by including it in the request body. This enables any attacker to create an admin account without authorization.

**Location**:
- `server/validators/authSchemas.js` lines 92-97
- `server/controllers/authController.js` lines 146

**Impact**:
Complete privilege escalation. Attackers gain full administrative access including user management, moderation controls, and system configuration.

**Recommendation**:
1. Remove `"admin"` from the `role` field's valid values in authSchemas.js
2. Hardcode `role: "farmer"` in authController.js registration handler
3. Admin accounts should only be provisioned through database seed scripts or by existing admins

---

### [DQ-002] Information Disclosure & IDOR on Notifications Endpoint
**Severity**: CRITICAL
**Source**: docs/review.md
**Affected Endpoint**: GET /api/blog/notifications
**Affected Entity**: Notification

**Description**:
The notifications endpoint allows unauthenticated access via email query parameter (`?email=target@example.com`), enabling enumeration of user notifications including moderation alerts and private feedback.

**Location**:
- `server/controllers/blogController.js` lines 186-194

**Impact**:
- Privacy breach: attackers can read private user notifications
- User enumeration: verify which email addresses are registered
- Unauthorized mark-as-read: unauthenticated users can mark any notification as read

**Recommendation**:
1. Apply `protect` middleware to enforce authentication
2. Remove email query parameter support
3. Filter notifications strictly by `req.user._id`

---

### [DQ-003] Unauthenticated Storage Exhaustion (Disk DoS)
**Severity**: CRITICAL
**Source**: docs/review.md, docs/IMAGE_UPLOAD_ML_GUIDE.md
**Affected Endpoint**: POST /api/disease/detect
**Affected Entity**: DiseaseReport

**Description**:
The disease detection endpoint uses `optionalAuth` middleware, allowing unauthenticated users to upload images up to 10MB. When guests upload images, Multer saves them to `server/uploads/disease/` but the files are never deleted after prediction completes.

**Location**:
- `server/routes/diseaseRoutes.js` lines 80-87
- `server/controllers/diseaseController.js` lines 218-248

**Impact**:
- Automated scripts can fill server disk in minutes
- Node.js server, MongoDB, and ML service crash due to no disk space
- Denial of service for all users

**Recommendation**:
1. Implement cleanup logic: delete uploaded files for unauthenticated users after inference
2. Add strict IP-based rate limiting: 10 scans per 10 minutes for guests
3. Consider requiring authentication for disease detection

---

### [DQ-004] Shared Demo User Collision in Dashboard
**Severity**: CRITICAL
**Source**: docs/review.md
**Affected Endpoint**: POST /api/dashboard/fields, DELETE /api/dashboard/fields/:id
**Affected Entity**: GeoField

**Description**:
The dashboard routes use ad-hoc `optionalAuth` middleware that assigns all unauthenticated users the same fake user ID (`"000000000000000000000000"`). This causes all guests to share the same field polygons in the database.

**Location**:
- `server/routes/dashboardRoutes.js` lines 68-73

**Impact**:
- Guest A draws and saves a farm polygon
- Guest B opens dashboard and sees Guest A's farm
- Guest B can delete Guest A's fields
- Data collision and loss for all unauthenticated users

**Recommendation**:
1. Store guest field polygons client-side using IndexedDB or localStorage
2. Only persist fields to MongoDB when user is authenticated
3. Remove fake user ID from optionalAuth middleware

---

## WARNING (Ambiguous/Incomplete)

### [DQ-005] Dual Parallel Data Models (Farm vs GeoField)
**Severity**: WARNING
**Source**: docs/review.md, docs/DATABASE_DESIGN.md
**Affected Entities**: Farm, GeoField

**Description**:
The application maintains two separate schemas for land management:
- `Farm.js`: Contains crops, cropHistory, soilType, location (polygon)
- `GeoField.js`: Contains boundary, centroid, weatherSnapshot, recommendation

A field saved on the Dashboard (GeoField) does not appear in the user's Farm list or Farm Statistics page.

**Impact**:
- User confusion: separate interfaces for same concept
- Duplicate code: parallel controllers and services
- Data inconsistency: fields in GeoField not linked to Farm

**Recommendation**:
Consolidate into a single hierarchical schema where a Farm owns multiple Field sub-documents.

---

### [DQ-006] Global Blocking AI Throttle
**Severity**: WARNING
**Source**: docs/review.md, docs/GEMINI_AI_GUIDE.md
**Affected Endpoints**: POST /api/advisory/*, POST /api/advisory/disease

**Description**:
The Gemini AI service uses a synchronous sleep-based throttle with 15-second minimum interval. When multiple users request AI advisory concurrently, they wait sequentially in a blocking queue.

**Location**:
- `server/services/geminiService.js` lines 110-124

**Impact**:
- 4th concurrent user waits 45-60 seconds
- Frontend fetch timeouts
- Poor user experience under load

**Recommendation**:
Replace synchronous sleep with asynchronous job queues (BullMQ/Redis) or standard HTTP 429 backoff.

---

### [DQ-007] Dual JWT Storage (localStorage + httpOnly cookie)
**Severity**: WARNING
**Source**: docs/review.md
**Affected Component**: AuthContext.jsx, authController.js

**Description**:
The server sets an httpOnly cookie AND returns the JWT in the response body. The client stores the token in localStorage, making it accessible to JavaScript.

**Location**:
- `client/src/context/AuthContext.jsx` lines 51-55
- `server/controllers/authController.js` lines 98-107

**Impact**:
Token exposed to XSS attacks. Any compromised third-party script can exfiltrate the session token.

**Recommendation**:
Remove token from localStorage. Rely exclusively on httpOnly cookies.

---

### [DQ-008] Missing Magic Bytes Verification on Profile Avatar Uploads
**Severity**: WARNING
**Source**: docs/review.md
**Affected Endpoint**: POST /api/auth/profile/avatar

**Description**:
While `/api/disease/detect` validates file magic bytes, avatar upload does not chain `validateUploadedFile` middleware.

**Location**:
- `server/routes/authRoutes.js` lines 126-131

**Impact**:
Spoofed files (polyglot files, disguised executables) can be uploaded to `/uploads/profiles/`.

**Recommendation**:
Add `handleMulterError` and `validateUploadedFile` middleware to avatar upload route.

---

### [DQ-009] Unrestricted Guest Voting Inflation
**Severity**: WARNING
**Source**: docs/review.md
**Affected Endpoints**: POST /api/forum/:id/upvote

**Description**:
Forum upvote handlers increment `guestUpvoteCount` for unauthenticated users without any rate limiting or fingerprinting.

**Location**:
- `server/controllers/forumController.js` lines 144-146

**Impact**:
Automated scripts can artificially inflate vote counts to manipulate content visibility.

**Recommendation**:
1. Require authentication for voting, OR
2. Use signed client cookies/fingerprints with rate limiting

---

### [DQ-010] Database Auto-Seeding in Request Handlers
**Severity**: WARNING
**Source**: docs/review.md
**Affected Endpoints**: GET /api/market/prices, GET /api/market/latest

**Description**:
`seedSampleDataIfEmpty()` is invoked inside every public market price GET endpoint.

**Location**:
- `server/controllers/marketPriceController.js` lines 107-108

**Impact**:
- Unnecessary database queries on every request
- Potential race conditions with concurrent requests
- Slower API response times

**Recommendation**:
Remove runtime seed checks. Run database seeding during server bootstrap or via `npm run seed`.

---

### [DQ-011] Missing Vite Dev Proxy for Uploaded Media
**Severity**: WARNING
**Source**: docs/review.md
**Affected Component**: vite.config.js

**Description**:
Vite dev proxy only forwards `/api` requests to Express backend. The `/uploads` path is not proxied.

**Location**:
- `client/vite.config.js` lines 71-74

**Impact**:
- During local development, uploaded images and avatars return 404
- Broken image links in disease detection results and user profiles

**Recommendation**:
Add `"/uploads": "http://localhost:5000"` to vite.config.js proxy configuration.

---

## INFO (Recommendations)

### [DQ-012] Monolithic Dashboard Component (1590 Lines)
**Severity**: INFO
**Source**: docs/review.md
**Affected Component**: Dashboard.jsx

**Description**:
The Dashboard component handles Leaflet map, geocoding, polygon drawing, weather, disease scanning, and AI advisory in a single 1590-line file.

**Impact**:
- Difficult to maintain and test
- Re-renders cause UI micro-stutters
- Poor code organization

**Recommendation**:
Decompose into modular subcomponents: `<FieldMapView />`, `<WeatherWidget />`, `<CropAdvisoryPanel />`, `<SavedFieldsDrawer />`.

---

### [DQ-013] Hardcoded English Strings in Translated Views
**Severity**: INFO
**Source**: docs/review.md
**Affected Components**: AdminDashboard.jsx, Community.jsx, CropCalendar.jsx

**Description**:
While LanguageContext exists with support for English, Urdu, and Punjabi, several pages have hardcoded English text that doesn't use the `t()` translation function.

**Impact**:
- Incomplete internationalization
- Poor user experience for non-English speakers

**Recommendation**:
Extract all strings to translation files (en.json, ur.json, pa.json).

---

### [DQ-014] Leaflet Search Popup XSS Vector
**Severity**: INFO
**Source**: docs/review.md
**Affected Component**: Dashboard.jsx

**Description**:
Unsanitized search text is interpolated into HTML string passed to Leaflet popup: `.bindPopup(`<div ...><strong>${result.display_name}</strong></div>`)`.

**Location**:
- `client/src/Dashboard.jsx` lines 360-364

**Impact**:
Potential XSS if search results contain malicious HTML/JavaScript.

**Recommendation**:
Use DOM text nodes or sanitize strings before rendering in map popups.

---

### [DQ-015] Broken Navigation in Bookmarks Page
**Severity**: INFO
**Source**: docs/review.md
**Affected Component**: Bookmarks.jsx

**Description**:
Bookmarks page renders cards for saved articles, advisories, and questions, but cards lack navigation links. Users cannot click to view full content.

**Location**:
- `client/src/pages/Bookmarks.jsx` lines 110-158

**Impact**:
Poor UX: bookmarks are view-only with no way to access full content.

**Recommendation**:
Wrap card headers in `<Link to={route}>` components.

---

### [DQ-016] Broken Offline Navbar Avatar
**Severity**: INFO
**Source**: docs/review.md
**Affected Component**: Navbar.jsx

**Description**:
When user has no uploaded avatar, navbar loads default image from external Unsplash URL. In offline scenarios, this causes broken image icons.

**Location**:
- `client/src/components/Navbar.jsx` line 84

**Impact**:
Broken UI in offline mode (defeats PWA offline-first design).

**Recommendation**:
Use inline SVG or bundled local asset for default avatar.

---

## Cross-Referenced Issues

The following design quality issues are directly linked to business rules:

| Issue ID | Business Rule | Category |
|----------|---------------|----------|
| DQ-001 | BR-013 | Authorization |
| DQ-002 | BR-014 | Authorization |
| DQ-003 | BR-015 | Constraint |
| DQ-005 | BR-009, BR-010, BR-011 | Validation |
| DQ-006 | BR-007 | Constraint |

---

## Next Steps

### Immediate Action Required
1. **Security Hotfixes** (DQ-001 through DQ-004): These vulnerabilities must be patched before production deployment
2. **Code Review**: Conduct security audit of authentication and authorization middleware

### Short Term (Next Sprint)
1. Address WARNING-level issues (DQ-005 through DQ-011)
2. Implement comprehensive test coverage for security-critical endpoints
3. Add security headers and CSP policies

### Long Term
1. Address INFO-level recommendations (DQ-012 through DQ-016)
2. Refactor monolithic components
3. Complete internationalization coverage
4. Implement comprehensive security testing suite

---

**Analysis Completed**: 2026-10-02
**Next Phase**: Implementation and Testing
