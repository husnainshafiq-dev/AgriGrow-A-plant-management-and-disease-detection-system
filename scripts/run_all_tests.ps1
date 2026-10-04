# ============================================================
# [TESTS] AgriGrow -- Automated Test Suite Runner
# ============================================================

$ErrorActionPreference = "Continue"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  [AgriGrow] Automated Full-Stack Test Runner" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$results = [System.Collections.Generic.List[PSCustomObject]]::new()

function Record-Result {
    param(
        [string]$Category,
        [string]$TestName,
        [bool]$Success,
        [string]$Details
    )
    $statusText = if ($Success) { "PASS" } else { "FAIL" }
    $color = if ($Success) { "Green" } else { "Red" }
    Write-Host "  [$statusText] $TestName - $Details" -ForegroundColor $color
    $results.Add([PSCustomObject]@{
        Category = $Category
        Test     = $TestName
        Status   = $statusText
        Details  = $Details
    })
}

# ------------------------------------------------------------
# 1. Pre-Flight Service Health Checks
# ------------------------------------------------------------
Write-Host "1. Checking Services Health..." -ForegroundColor Yellow

# MongoDB
$mongo = Get-Service -Name *mongo* -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Running" }
if ($mongo) {
    Record-Result "Services" "MongoDB Database" $true "Service is running"
} else {
    Record-Result "Services" "MongoDB Database" $false "MongoDB service not detected"
}

# ML Service (:8000)
try {
    $mlHealth = Invoke-RestMethod -Uri "http://localhost:8000/health" -TimeoutSec 3 -ErrorAction Stop
    $isMlOk = ($mlHealth.status -eq "healthy" -or $mlHealth.status -eq "available") -and $mlHealth.model_loaded -eq $true
    Record-Result "Services" "FastAPI ML Service (:8000)" $isMlOk "Model: $($mlHealth.model_name) ($($mlHealth.classes_count) classes)"
} catch {
    Record-Result "Services" "FastAPI ML Service (:8000)" $false "Could not connect to http://localhost:8000/health"
}

# Backend (:5000)
try {
    $backendHealth = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 3 -ErrorAction Stop
    $isBackOk = $backendHealth.success -eq $true
    Record-Result "Services" "Express Backend API (:5000)" $isBackOk "Status: $($backendHealth.status)"
} catch {
    Record-Result "Services" "Express Backend API (:5000)" $false "Could not connect to http://localhost:5000/api/health"
}

# Frontend (:3000)
try {
    $frontend = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    $isFrontOk = $frontend.StatusCode -eq 200
    Record-Result "Services" "React/Vite Frontend (:3000)" $isFrontOk "HTTP $($frontend.StatusCode) OK"
} catch {
    Record-Result "Services" "React/Vite Frontend (:3000)" $false "Could not connect to http://localhost:3000"
}

Write-Host ""

# ------------------------------------------------------------
# 2. Built-in Test Suites
# ------------------------------------------------------------
Write-Host "2. Running Unit & Integration Test Suites..." -ForegroundColor Yellow

# Server Tests (Jest)
try {
    $jestOut = npm --prefix server test 2>&1
    $jestOk = $LASTEXITCODE -eq 0
    Record-Result "Unit Suites" "Server Tests (Jest)" $jestOk "Exit code: $LASTEXITCODE"
} catch {
    Record-Result "Unit Suites" "Server Tests (Jest)" $false "$_"
}

# Client Tests (Vitest)
try {
    $vitestOut = npm --prefix client test 2>&1
    $vitestOk = $LASTEXITCODE -eq 0
    Record-Result "Unit Suites" "Client Tests (Vitest)" $vitestOk "Exit code: $LASTEXITCODE"
} catch {
    Record-Result "Unit Suites" "Client Tests (Vitest)" $false "$_"
}

# Python ML Model Test
try {
    $pyTest = & .\.venv\Scripts\python.exe ml-service\test_ml_load.py 2>&1
    $pyOk = $LASTEXITCODE -eq 0
    Record-Result "Unit Suites" "ML ONNX Model Loader" $pyOk "Exit code: $LASTEXITCODE"
} catch {
    Record-Result "Unit Suites" "ML ONNX Model Loader" $false "$_"
}

Write-Host ""

# ------------------------------------------------------------
# 3. API Smoke & End-to-End Tests
# ------------------------------------------------------------
Write-Host "3. Running API Smoke & End-to-End Tests..." -ForegroundColor Yellow

# Public Endpoints
try {
    $blog = Invoke-RestMethod -Uri "http://localhost:5000/api/blog/posts" -TimeoutSec 5
    Record-Result "API Smoke" "GET /api/blog/posts" $true "Count: $($blog.data.Count)"
} catch {
    Record-Result "API Smoke" "GET /api/blog/posts" $false "$_"
}

try {
    $market = Invoke-RestMethod -Uri "http://localhost:5000/api/market/prices/latest" -TimeoutSec 5
    Record-Result "API Smoke" "GET /api/market/prices/latest" $true "Prices returned"
} catch {
    Record-Result "API Smoke" "GET /api/market/prices/latest" $false "$_"
}

# User Registration & Auth Flow
$token = $null
try {
    $email = "autotest_$(Get-Random)@example.com"
    $regBody = @{
        name = "Automated Test User"
        email = $email
        password = "Password123"
        confirmPassword = "Password123"
    } | ConvertTo-Json

    $reg = Invoke-RestMethod -Uri "http://localhost:5000/api/auth/register" -Method Post -Body $regBody -ContentType "application/json" -TimeoutSec 5
    $token = $reg.data.token
    Record-Result "Auth Flow" "POST /api/auth/register" ($token -ne $null) "Token acquired"
} catch {
    Record-Result "Auth Flow" "POST /api/auth/register" $false "$_"
}

if ($token) {
    $headers = @{ Authorization = "Bearer $token" }

    # ML Health Bridge
    try {
        $mlBridge = Invoke-RestMethod -Uri "http://localhost:5000/api/disease/ml-health" -Headers $headers -TimeoutSec 5
        Record-Result "API Endpoints" "GET /api/disease/ml-health" ($mlBridge.success -eq $true) "status: $($mlBridge.status)"
    } catch {
        Record-Result "API Endpoints" "GET /api/disease/ml-health" $false "$_"
    }

    # Farms Nearby Route
    try {
        $nearby = Invoke-RestMethod -Uri "http://localhost:5000/api/farms/nearby?lat=31.5&lng=74.3" -Headers $headers -TimeoutSec 5
        Record-Result "API Endpoints" "GET /api/farms/nearby" ($nearby.success -eq $true) "Nearby query resolved"
    } catch {
        Record-Result "API Endpoints" "GET /api/farms/nearby" $false "$_"
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$results | Format-Table -AutoSize
