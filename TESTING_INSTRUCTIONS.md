# 🧪 AgriGrow — Automated Testing Instructions & Runbook

This document contains the step-by-step instructions and commands for testing the AgriGrow web application across all layers: **Frontend (React/Vite)**, **Backend (Node.js/Express + MongoDB)**, and **ML Service (FastAPI + ONNX MobileNetV2)**.

---

## ⚡ Master Prompt (Single-File Instruction)

Whenever you want the AI assistant to perform testing, you only need to say:

> **"Look into [TESTING_INSTRUCTIONS.md](file:///d:/model/TESTING_INSTRUCTIONS.md) and perform the tests."**

When receiving this prompt, the assistant will automatically read this master index, inspect the related test suites, run [scripts/run_all_tests.ps1](file:///d:/model/scripts/run_all_tests.ps1), and audit the results against the quality specifications.

---

## 📁 Master Registry of All Related Files

This single document connects every script, test suite, and audit document in the repository:

### 1. Test Execution & Automation Scripts
- **[scripts/run_all_tests.ps1](file:///d:/model/scripts/run_all_tests.ps1)**: Master PowerShell test runner. Checks service health, runs Jest, Vitest, and ONNX loader tests, and performs live API smoke tests.
- **[server/scripts/seed-db.js](file:///d:/model/server/scripts/seed-db.js)**: Database seed script initializing demo users, crops, and default market records.

### 2. Unit, Integration & Microservice Test Suites
- **[server/tests/marketPrice.test.js](file:///d:/model/server/tests/marketPrice.test.js)**: Backend Jest suite testing AMIS market price endpoints.
- **[client/src/pages/__tests__/MarketPrices.test.jsx](file:///d:/model/client/src/pages/__tests__/MarketPrices.test.jsx)**: Frontend Vitest suite testing UI table rendering and API mocking.
- **[ml-service/test_ml_load.py](file:///d:/model/ml-service/test_ml_load.py)**: Python script testing active `mobilenet_v2_47_classes.onnx` loading and tensor inference.
- **[ml-service/test_normalization.py](file:///d:/model/ml-service/test_normalization.py)**: Python script verifying ImageNet mean/std preprocessing.

### 3. Specifications, Test Cases & Quality Audits
- **[docs/TEST_REPORT.md](file:///d:/model/docs/TEST_REPORT.md)**: Baseline verification report covering live endpoints, inference timings, and bug resolutions.
- **[DESIGN_QUALITY_ISSUES.md](file:///d:/model/DESIGN_QUALITY_ISSUES.md)**: Detailed catalog of 16 security and quality issues (DQ-001 through DQ-016).
- **[DESIGN_TESTCASES.md](file:///d:/model/DESIGN_TESTCASES.md)**: 90+ derived test cases (CRUD, validation, state machines, and auth rules).
- **[DESIGN_CODE_GAP_REPORT.md](file:///d:/model/DESIGN_CODE_GAP_REPORT.md)**: 88% design compliance analysis and endpoint audit.
- **[CODE_ANALYSIS.md](file:///d:/model/CODE_ANALYSIS.md)**: Structural map of 119 API endpoints, 14 models, and 13 UI pages.
- **[DESIGN_ANALYSIS.md](file:///d:/model/DESIGN_ANALYSIS.md)**: System architecture and entity relationship specifications.

### 4. Core Implementation Files Covered by Tests
- **[server/server.js](file:///d:/model/server/server.js)**: Express backend entry point and `/api/health` bridge.
- **[server/services/mlService.js](file:///d:/model/server/services/mlService.js)**: Circuit breaker and HTTP client for FastAPI ML service.
- **[server/routes/farmRoutes.js](file:///d:/model/server/routes/farmRoutes.js)**: Farm management and `/nearby` geospatial routing.
- **[server/controllers/diseaseController.js](file:///d:/model/server/controllers/diseaseController.js)**: Image upload handling and advisory orchestration.
- **[server/controllers/authController.js](file:///d:/model/server/controllers/authController.js)**: JWT authentication and registration controller.
- **[server/validators/authSchemas.js](file:///d:/model/server/validators/authSchemas.js)**: Joi validation schemas for authentication.
- **[ml-service/app.py](file:///d:/model/ml-service/app.py)**: FastAPI microservice exposing `/health`, `/predict`, and `/classes`.
- **[client/vite.config.js](file:///d:/model/client/vite.config.js)**: Vite client configuration and API reverse-proxy settings.

---

## 📋 Architecture & Expected Service Ports

| Service | Expected URL / Port | Technology | Process |
| :--- | :--- | :--- | :--- |
| **Frontend** | `http://localhost:3000` | React 19 + Vite | `npm run client` |
| **Backend API** | `http://localhost:5000` | Node.js Express + Mongoose | `npm run server` |
| **ML Microservice** | `http://localhost:8000` | FastAPI + ONNX Runtime | `python -m uvicorn app:app` |
| **Database** | `mongodb://localhost:27017` | MongoDB Community Server | `mongod` service |

---

## 🚀 One-Command Full Test Runner

You can execute the entire test workflow with a single PowerShell command:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run_all_tests.ps1
```

---

## 🔬 Test Phases & Manual Instructions

### Phase 1: Pre-Flight & Health Checks

Verify that MongoDB, the ML Service, the Express Backend, and the Vite Frontend are all active and healthy.

```powershell
# 1. MongoDB Service Status
Get-Service -Name *mongo* -ErrorAction SilentlyContinue

# 2. ML Service Health
Invoke-RestMethod -Uri "http://localhost:8000/health"
# Expected: status="healthy", model_loaded=true, classes_count=47

# 3. Backend API & ML Bridge Health
Invoke-RestMethod -Uri "http://localhost:5000/api/health"
# Expected: success=true, status="ready", ml_service.status="healthy"

# 4. Frontend HTTP Status
Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing | Select-Object StatusCode, StatusDescription
# Expected: StatusCode=200, StatusDescription="OK"
```

---

### Phase 2: Built-in Unit & Integration Test Suites

Run the test suites included in the repository.

```powershell
# 1. Backend Tests (Jest)
npm --prefix server test
# Expected: 1 test suite passed (market price tests)

# 2. Frontend Tests (Vitest)
npm --prefix client test
# Expected: 1 test suite passed (MarketPrices render & fetch)

# 3. ML Model Loading Test (Python ONNX)
& .\.venv\Scripts\python.exe ml-service\test_ml_load.py
# Expected: Exit code 0, "Model loaded successfully", 47 classes
```

---

### Phase 3: Backend API Smoke Tests

Verify public endpoints and authenticated routes using PowerShell:

```powershell
# --- Public Endpoints (No Auth Required) ---
Invoke-RestMethod -Uri "http://localhost:5000/api/blog/posts"
Invoke-RestMethod -Uri "http://localhost:5000/api/forum/categories"
Invoke-RestMethod -Uri "http://localhost:5000/api/market/prices/latest"
Invoke-RestMethod -Uri "http://localhost:5000/api/market/crops"
Invoke-RestMethod -Uri "http://localhost:5000/api/cost/crops"

# --- User Registration & Authentication ---
$testEmail = "tester_$(Get-Random)@example.com"
$registerBody = @{
    name = "Automated Tester"
    email = $testEmail
    password = "Password123"
    confirmPassword = "Password123"
} | ConvertTo-Json

$authResponse = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json"
$token = $authResponse.data.token
$headers = @{ Authorization = "Bearer $token" }

# --- Authenticated Endpoints ---
Invoke-RestMethod -Uri "http://localhost:5000/api/auth/me" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:5000/api/disease/history" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:5000/api/disease/ml-health" -Headers $headers
Invoke-RestMethod -Uri "http://localhost:5000/api/farms/nearby?lat=31.5&lng=74.3" -Headers $headers
```

---

### Phase 4: End-to-End Image Detection & AI Pipeline

Test image upload, ONNX inference, and advisory generation across the full stack.

```powershell
# 1. Check direct ML inference with negative test (should return 400 for non-image)
try {
    $tempFile = [System.IO.Path]::GetTempFileName()
    Set-Content -Path $tempFile -Value "Not an image"
    $form = @{ file = Get-Item $tempFile }
    Invoke-RestMethod -Uri "http://localhost:8000/predict" -Method Post -Form $form
} catch {
    Write-Output "Negative test passed: $($_.Exception.Message)" # Expected: 400 Bad Request
} finally {
    Remove-Item $tempFile -ErrorAction SilentlyContinue
}

# 2. Check full backend disease detection endpoint
# Find a sample leaf image in uploads or test assets:
$sampleImage = (Get-ChildItem -Path "server\uploads\disease\*.jpg", "server\uploads\disease\*.png" -ErrorAction SilentlyContinue | Select-Object -First 1).FullName

if ($sampleImage) {
    $form = @{ image = Get-Item $sampleImage }
    $detection = Invoke-RestMethod -Uri "http://localhost:5000/api/disease/detect" -Method Post -Headers $headers -Form $form
    Write-Output "Disease Detected: $($detection.data.diseaseName) (Confidence: $($detection.data.confidence)%)"
}
```

---

### Phase 5: Browser UI Automation (Interactive Verification)

For the AI assistant using `browser_subagent`:

1. **Launch Browser** to `http://localhost:3000`.
2. **Page Load**: Check page title contains `"AgriGrow"`.
3. **Navigation**: Click through navigation links (Dashboard, Farms, Disease Detection, Market Prices, Blog).
4. **Console Audit**: Inspect browser console logs to ensure no unhandled exceptions or 404 resource errors occur.
5. **Form Interaction**: Test filling and submitting forms (e.g. login, cost calculator).

---

### Phase 6: Security & Boundary Verification

1. **Privilege Escalation**:
   Attempt to register with `role: "admin"` in `POST /api/auth/register`. The server must either reject the field or default to `role: "farmer"`.
2. **Route Shadowing Check**:
   Ensure `GET /api/farms/nearby` is reachable and does not return an ObjectId `CastError`.
3. **ML Health Contract Check**:
   Ensure `GET /api/disease/ml-health` returns `200 OK` (not `503`) when the ML service is running.

---

## 📊 Test Report Format (Template)

When completing a test run, output results using this format:

```markdown
### 🧪 AgriGrow Test Execution Summary

- **Timestamp:** YYYY-MM-DD HH:MM:SS
- **Services Verified:** Frontend (:3000), Backend (:5000), ML (:8000), MongoDB (:27017)

| Test Category | Suite / Target | Status | Notes |
| :--- | :--- | :--- | :--- |
| **Service Health** | FastAPI `/health` | ✅ PASS | mobilenet_v2 loaded (47 classes) |
| **Service Health** | Express `/api/health` | ✅ PASS | Database & ML Bridge connected |
| **Unit Tests** | Server (Jest) | ✅ PASS | 3/3 tests passed |
| **Unit Tests** | Client (Vitest) | ✅ PASS | 1/1 tests passed |
| **ML Load Test** | Python ONNX Test | ✅ PASS | Verified inference |
| **API Smoke** | Public Endpoints | ✅ PASS | Blog, Market, Costs (200 OK) |
| **API Auth** | Register & /me | ✅ PASS | JWT issued & verified |
| **E2E Pipeline** | Image Detection | ✅ PASS | Classification & Advisory generated |
| **Security Audit**| Route & Auth Checks | ✅ PASS | /nearby works, role escalation blocked |
```
