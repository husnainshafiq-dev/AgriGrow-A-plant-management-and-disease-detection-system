# 📸 Image Upload & ML Integration — Architecture Guide

> **STEP 3.1** — Image Upload System  
> **STEP 3.2** — ML Model Integration (Python Microservice)

---

## 1. Complete System Architecture

```
                           AgriGrow — Disease Detection Pipeline
╔══════════════════════════════════════════════════════════════════════════════════╗
║                                                                                ║
║  ┌──────────────────┐                                                          ║
║  │   REACT CLIENT   │                                                          ║
║  │──────────────────│                                                          ║
║  │ • <input>        │                                                          ║
║  │   type="file"    │                                                          ║
║  │ • Image preview  │                                                          ║
║  │ • FormData API   │                                                          ║
║  │ • Progress bar   │                                                          ║
║  └────────┬─────────┘                                                          ║
║           │                                                                    ║
║     1. POST /api/disease/detect                                                ║
║        Content-Type: multipart/form-data                                       ║
║        Body: { image: <binary>, farmId?: "...", cropId?: "..." }               ║
║           │                                                                    ║
║  ═════════▼══════════════════════════════════════════════════════════           ║
║  ║             NODE.JS EXPRESS SERVER (port 5000)              ║               ║
║  ║─────────────────────────────────────────────────────────────║               ║
║  ║                                                             ║               ║
║  ║  2. ┌─────────────┐                                         ║               ║
║  ║     │ JWT protect  │ Verify authentication token             ║               ║
║  ║     └──────┬──────┘                                         ║               ║
║  ║            │                                                 ║               ║
║  ║  3. ┌──────▼──────┐                                         ║               ║
║  ║     │   MULTER    │ • Validate MIME type                     ║               ║
║  ║     │   upload    │ • Check file size (≤10MB)                ║               ║
║  ║     │             │ • Save to uploads/disease/               ║               ║
║  ║     └──────┬──────┘                                         ║               ║
║  ║            │                                                 ║               ║
║  ║  4. ┌──────▼──────────┐                                     ║               ║
║  ║     │ Magic bytes     │ Verify file header matches MIME      ║               ║
║  ║     │ validation      │ (anti-spoofing protection)           ║               ║
║  ║     └──────┬──────────┘                                     ║               ║
║  ║            │                                                 ║               ║
║  ║  5. ┌──────▼──────────────────────┐                         ║               ║
║  ║     │ Disease Controller          │                         ║               ║
║  ║     │                             │                         ║               ║
║  ║     │ a. Stream image to ML ──────────────────────┐         ║               ║
║  ║     │    via FormData POST        │               │         ║               ║
║  ║     │                             │               │         ║               ║
║  ║     └──────┬──────────────────────┘               │         ║               ║
║  ║            │                                       │         ║               ║
║  ║            │ (waits for ML response)               │         ║               ║
║  ║            │                                       │         ║               ║
║  ╚════════════╪═══════════════════════════════════════╪═════════╝               ║
║               │                                       │                        ║
║               │                    ┌──────────────────▼─────────────┐           ║
║               │                    │  PYTHON FastAPI ML SERVICE     │           ║
║               │                    │  (port 8000)                   │           ║
║               │                    │────────────────────────────────│           ║
║               │                    │                                │           ║
║               │                    │  6. Receive image (multipart)  │           ║
║               │                    │  7. Open with Pillow (PIL)     │           ║
║               │                    │  8. Resize to 224×224 px       │           ║
║               │                    │  9. Convert to numpy array     │           ║
║               │                    │  10. model.predict()           │           ║
║               │                    │  11. Get top-5 predictions     │           ║
║               │                    │  12. Look up disease info      │           ║
║               │                    │  13. Return JSON               │           ║
║               │                    │                                │           ║
║               │                    └─────────────┬──────────────────┘           ║
║               │                                  │                             ║
║               │                    JSON response │                             ║
║               │ ◄────────────────────────────────┘                             ║
║               │                                                                ║
║  ═════════════╪═══════════════════════════════════════════════════              ║
║  ║            ▼                                                 ║              ║
║  ║  14. ┌─────────────────────────┐                             ║              ║
║  ║      │ Apply confidence        │ high/moderate/low/very_low  ║              ║
║  ║      │ threshold logic         │                             ║              ║
║  ║      └──────┬──────────────────┘                             ║              ║
║  ║             │                                                 ║              ║
║  ║  15. ┌──────▼──────────────────┐                             ║              ║
║  ║      │ Gemini AI Advisory      │ (optional — only for        ║              ║
║  ║      │ (if disease detected)   │  diseased plants)           ║              ║
║  ║      └──────┬──────────────────┘                             ║              ║
║  ║             │                                                 ║              ║
║  ║  16. ┌──────▼──────────────────┐                             ║              ║
║  ║      │ Save to MongoDB         │ Disease collection           ║              ║
║  ║      │ (disease_reports)       │                             ║              ║
║  ║      └──────┬──────────────────┘                             ║              ║
║  ║             │                                                 ║              ║
║  ║  17. Return JSON response to client                          ║              ║
║  ╚═════════════╪════════════════════════════════════════════════╝              ║
║                │                                                               ║
║  ┌─────────────▼────────────┐                                                  ║
║  │   REACT CLIENT           │                                                  ║
║  │   Displays:              │                                                  ║
║  │   • Disease name         │                                                  ║
║  │   • Confidence bar       │                                                  ║
║  │   • Description          │                                                  ║
║  │   • Recommendation       │                                                  ║
║  │   • AI Advisory          │                                                  ║
║  │   • Top-5 predictions    │                                                  ║
║  └──────────────────────────┘                                                  ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. File & Folder Structure

```
d:\model\
├── ml-service/                      ← NEW: Python ML microservice
│   ├── app.py                       ← FastAPI application
│   └── requirements.txt             ← Python dependencies
│
├── plant_disease_model.h5           ← Trained Keras model (existing)
├── predict_server.py                ← OLD stdin/stdout version (kept for reference)
│
└── server/                          ← Node.js Express backend
    ├── middleware/
    │   ├── upload.js                ← ENHANCED: Multer config + magic bytes validation
    │   ├── auth.js                  ← JWT authentication
    │   ├── errorHandler.js          ← Global error handler
    │   └── validate.js              ← Joi validation
    │
    ├── services/
    │   ├── mlService.js             ← ENHANCED: Circuit breaker + retry + confidence
    │   └── geminiService.js         ← Gemini AI integration
    │
    ├── controllers/
    │   ├── diseaseController.js     ← ENHANCED: Full CRUD + stats + ML health
    │   └── ...
    │
    ├── routes/
    │   ├── diseaseRoutes.js         ← ENHANCED: Upload chain + stats routes
    │   └── ...
    │
    └── uploads/                     ← Image storage (auto-created)
        ├── disease/                 ← Plant disease scan images
        ├── profiles/                ← User avatars
        └── farms/                   ← Farm photos
```

---

## 3. Why a Python Microservice?

### 📊 Comparison: Direct Node.js vs Python Microservice

| Factor | Node.js (TensorFlow.js) | Python Microservice ✅ |
|---|---|---|
| **Model compatibility** | ❌ Must convert .h5 → tfjs format | ✅ Loads .h5 natively |
| **Inference speed** | ⚠️ Slower for CNN models | ✅ Optimized C++ backend |
| **Image processing** | ⚠️ Limited libraries | ✅ Pillow, OpenCV, scikit-image |
| **GPU support** | ❌ Limited | ✅ Full CUDA/cuDNN support |
| **ML ecosystem** | ⚠️ Minimal | ✅ NumPy, SciPy, scikit-learn |
| **Scaling** | ❌ Blocks event loop | ✅ Independent scaling |
| **Fault isolation** | ❌ Crash kills API server | ✅ ML crash doesn't affect API |
| **Team separation** | ❌ ML in JavaScript? | ✅ ML team works in Python |
| **Model updates** | ❌ Requires format conversion | ✅ Drop-in replacement |

### 🏗️ Architecture Benefits

```
MONOLITHIC (Bad):                    MICROSERVICE (Good):
┌────────────────────┐               ┌──────────────┐  ┌──────────────┐
│  Node.js Server    │               │  Node.js API │  │  Python ML   │
│ ┌────────────────┐ │               │  (Express)   │  │  (FastAPI)   │
│ │ Express API    │ │               │              │  │              │
│ │ + TF.js model  │ │               │  Port 5000   │  │  Port 8000   │
│ │ (blocks loop!) │ │               │  CPU: low    │  │  CPU: high   │
│ └────────────────┘ │               │  RAM: 256MB  │  │  RAM: 2GB    │
└────────────────────┘               │              │──│  GPU: opt.   │
                                     └──────────────┘  └──────────────┘
• One failure = everything down       • Independently scalable
• Can't use GPU easily                • Each service has own resources
• Event loop blocked during inference • Non-blocking architecture
```

---

## 4. Upload Security Measures (Defense in Depth)

```
LAYER 1: CLIENT-SIDE (UX only, not security)
├── File input accept="image/*"
├── File size check before upload
└── Image preview validation

LAYER 2: MULTER MIDDLEWARE
├── MIME type whitelist: image/jpeg, image/png, image/webp
├── File extension check: .jpg, .jpeg, .png, .webp
├── Size limit: 10 MB maximum
├── File count limit: 1 per request
└── Unique filename generation (prevents path traversal)

LAYER 3: MAGIC BYTES VALIDATION (post-upload)
├── Reads first 8 bytes of saved file
├── Compares against known image format headers:
│   ├── JPEG: FF D8 FF
│   ├── PNG:  89 50 4E 47
│   └── WebP: 52 49 46 46 (RIFF)
├── Deletes file immediately if mismatch
└── Returns 400 error (possible spoofing detected)

LAYER 4: ML SERVICE VALIDATION
├── PIL Image.open() — verifies decodable image
├── Content-type header check
└── File size limit (10 MB)
```

---

## 5. Error Handling Strategy

### Node.js → Python ML Communication Errors:

| Error Type | Status | User Message | Recovery |
|---|---|---|---|
| ML service not running | `503` | "Disease detection service is not available" | Retry later |
| Connection timeout | `503` | "Detection is taking longer than expected" | Auto-retry (2x) |
| Model not loaded | `503` | "ML model is still loading" | Wait 30s, retry |
| Invalid image | `400` | "Image could not be processed" | Upload different image |
| File too large | `413` | "Image file is too large" | Compress image |
| Circuit breaker open | `503` | "Service temporarily unavailable" | Auto-reset in 30s |

### Circuit Breaker Pattern:

```
        ┌──────────┐    Success     ┌──────────┐
        │  CLOSED  │───────────────►│  CLOSED  │ (normal operation)
        │          │◄───────────────│          │
        └────┬─────┘    Request     └──────────┘
             │
        3 failures
             │
        ┌────▼─────┐
        │   OPEN   │ ──── All requests fail immediately
        │          │      (no network calls made)
        └────┬─────┘
             │
        30 seconds
             │
        ┌────▼─────────┐
        │  HALF-OPEN   │ ──── Allow ONE test request
        │              │
        └────┬─────────┘
             │
       ┌─────┴──────┐
   Success       Failure
       │             │
  ┌────▼─────┐  ┌────▼─────┐
  │  CLOSED  │  │   OPEN   │
  │ (reset)  │  │ (again)  │
  └──────────┘  └──────────┘
```

### Retry with Exponential Backoff:

```
Attempt 1: Send request ──► FAIL
           Wait 1 second
Attempt 2: Send request ──► FAIL
           Wait 2 seconds (1s × 2)
Attempt 3: Send request ──► FAIL or SUCCESS
           (give up if still failing)
```

---

## 6. Confidence Threshold Logic

```
Confidence Level  │ Range     │ Action
──────────────────┼───────────┼──────────────────────────────────────
HIGH              │ ≥ 85%     │ Show result directly. Model is very sure.
MODERATE          │ 65% - 84% │ Show result with advisory to verify
                  │           │ with an agricultural expert.
LOW               │ 50% - 64% │ WARNING: Result may be inaccurate.
                  │           │ Suggest retaking image with better lighting.
VERY LOW          │ < 50%     │ Model cannot identify disease. Recommend
                  │           │ manual inspection by an expert.
```

---

## 7. API Request/Response Format

### POST `/api/disease/detect`

**Request:**
```http
POST /api/disease/detect HTTP/1.1
Authorization: Bearer eyJhbG...
Content-Type: multipart/form-data; boundary=----FormBoundary

------FormBoundary
Content-Disposition: form-data; name="image"; filename="leaf.jpg"
Content-Type: image/jpeg

<binary image data>
------FormBoundary
Content-Disposition: form-data; name="farmId"

65a1b2c3d4e5f6a7b8c9d0e1
------FormBoundary--
```

**Response (200 OK):**
```json
{
    "success": true,
    "message": "Disease detection complete",
    "data": {
        "id": "65b2c3d4e5f6a7b8c9d0e1f2",
        "prediction": "Tomato — Early Blight",
        "confidence": 94.32,
        "confidenceLevel": "high",
        "confidenceMessage": "High confidence prediction. The model is very certain.",
        "isHealthy": false,
        "isBelowThreshold": false,
        "description": "Caused by Alternaria solani. Concentric ring bull's-eye lesions...",
        "recommendation": "Remove affected leaves. Apply appropriate fungicides...",
        "aiAdvisory": "Based on the Early Blight diagnosis, here are my recommendations:\n1. Remove and destroy all infected leaves...\n2. Apply chlorothalonil or mancozeb fungicide...",
        "topPredictions": [
            { "class": "Tomato — Early Blight", "probability": 94.32 },
            { "class": "Tomato — Late Blight",  "probability": 3.21 },
            { "class": "Tomato — Septoria Leaf Spot", "probability": 1.05 },
            { "class": "Tomato — Target Spot", "probability": 0.89 },
            { "class": "Tomato — Bacterial Spot", "probability": 0.53 }
        ],
        "imageUrl": "/uploads/disease/1707840000-a1b2c3d4e5f6.jpg",
        "farm": "65a1b2c3d4e5f6a7b8c9d0e1",
        "crop": null,
        "createdAt": "2024-02-13T14:00:00.000Z"
    }
}
```

### Python ML `/predict` endpoint

**Request (from Node.js):**
```http
POST /predict HTTP/1.1
Content-Type: multipart/form-data

file=<image binary>
```

**Response (to Node.js):**
```json
{
    "success": true,
    "prediction": "Tomato — Early Blight",
    "confidence": 94.32,
    "is_healthy": false,
    "description": "Caused by Alternaria solani...",
    "recommendation": "Apply fungicides...",
    "severity": "moderate",
    "top_predictions": [
        { "class": "Tomato — Early Blight", "probability": 94.32 },
        { "class": "Tomato — Late Blight",  "probability": 3.21 }
    ],
    "inference_time_ms": 245.5
}
```

---

## 8. Running the System

### Start the ML Service:
```bash
cd ml-service
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Start the Node.js API:
```bash
cd server
npm install
npm run dev
```

### Verify ML Service is Running:
```bash
# Health check
curl http://localhost:8000/health

# Interactive API docs
open http://localhost:8000/docs
```

### Test Disease Detection:
```bash
curl -X POST http://localhost:5000/api/disease/detect \
  -H "Authorization: Bearer <your-jwt-token>" \
  -F "image=@/path/to/leaf.jpg" \
  -F "farmId=65a1b2c3d4e5f6a7b8c9d0e1"
```
