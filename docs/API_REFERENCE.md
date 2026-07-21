# 📡 AgriGrow API Reference

Base URL: `http://localhost:5000/api`

All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## 🔐 Authentication

### Register User
```
POST /api/auth/register
```
**Body:**
```json
{
  "name": "John Farmer",
  "email": "john@example.com",
  "password": "securePassword123"
}
```
**Response (201):**
```json
{
  "success": true,
  "message": "Registration successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "65f...",
      "name": "John Farmer",
      "email": "john@example.com",
      "role": "user"
    }
  }
}
```

---

### Login
```
POST /api/auth/login
```
**Body:**
```json
{
  "email": "john@example.com",
  "password": "securePassword123"
}
```

---

### Get Profile
```
GET /api/auth/me
🔒 Protected
```

---

## 🦠 Disease Detection

### Detect Disease
```
POST /api/disease/detect
🔒 Protected
Content-Type: multipart/form-data
```
**Form Data:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file | File | ✅ | Plant leaf image (JPEG/PNG/WebP, max 10MB) |
| farmId | String | | MongoDB ObjectId of associated farm |
| cropId | String | | MongoDB ObjectId of associated crop |

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "65f...",
    "prediction": "Tomato — Early Blight",
    "confidence": 94.32,
    "is_healthy": false,
    "description": "Caused by Alternaria solani...",
    "recommendation": "Remove affected leaves...",
    "top_predictions": [
      { "class": "Tomato — Early Blight", "probability": 94.32 },
      { "class": "Tomato — Late Blight", "probability": 3.21 }
    ]
  }
}
```

---

### Get Detection History
```
GET /api/disease/history?page=1&limit=10
🔒 Protected
```

---

### Get Single Detection
```
GET /api/disease/:id
🔒 Protected
```

---

## 🤖 AI Advisory

### Ask Advisory
```
POST /api/advisory/ask
🔒 Protected
```
**Body:**
```json
{
  "query": "How should I treat early blight on my tomato plants?",
  "context": {
    "cropType": "Tomato",
    "soilType": "loamy",
    "season": "summer",
    "location": "Karnataka, India",
    "diseaseDetected": "Tomato — Early Blight"
  },
  "category": "disease-treatment"
}
```

---

### Get Advisory History
```
GET /api/advisory/history?page=1&limit=10&category=disease-treatment&bookmarked=true
🔒 Protected
```

---

### Update Advisory (Bookmark/Rate)
```
PATCH /api/advisory/:id
🔒 Protected
```
**Body:**
```json
{
  "rating": 5,
  "isBookmarked": true
}
```

---

## 🗺️ Farm Management

### Create Farm
```
POST /api/farms
🔒 Protected
```
**Body:**
```json
{
  "name": "Green Valley Farm",
  "description": "Main vegetable farm",
  "location": {
    "type": "Polygon",
    "coordinates": [[[77.59, 12.97], [77.60, 12.97], [77.60, 12.98], [77.59, 12.98], [77.59, 12.97]]]
  },
  "center": {
    "type": "Point",
    "coordinates": [77.595, 12.975]
  },
  "area": { "value": 5, "unit": "acres" },
  "soilType": "loamy"
}
```

---

### List Farms
```
GET /api/farms
🔒 Protected
```

### Get Farm
```
GET /api/farms/:id
🔒 Protected
```

### Update Farm
```
PUT /api/farms/:id
🔒 Protected
```

### Delete Farm
```
DELETE /api/farms/:id
🔒 Protected
```

---

## 💰 Cost Estimation

### Estimate Crop Cost
```
POST /api/cost/estimate
🔒 Protected
```
**Body:**
```json
{
  "cropName": "tomato",
  "area": 5,
  "customCosts": {
    "labor": 600
  }
}
```
**Response (200):**
```json
{
  "success": true,
  "data": {
    "available": true,
    "crop": "tomato",
    "area": "5 acres",
    "costBreakdown": {
      "seeds": 750,
      "fertilizer": 1000,
      "pesticides": 600,
      "labor": 3000,
      "irrigation": 900,
      "equipment": 500,
      "other": 0
    },
    "totalCost": 6750,
    "expectedYield": { "value": 125000, "unit": "kg" },
    "expectedRevenue": 100000,
    "expectedProfit": 93250,
    "roi": "1381.5%",
    "currency": "USD"
  }
}
```

---

### Get Supported Crops
```
GET /api/cost/crops
🔓 Public
```

---

### Save Crop Costs
```
PUT /api/cost/crop/:id
🔒 Protected
```

---

## 🏥 Health Check

```
GET /api/health
🔓 Public
```
**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "environment": "development",
  "timestamp": "2026-02-13T14:10:44.000Z"
}
```

---

## ⚠️ Error Response Format

All errors follow this shape:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "statusCode": 400
}
```

Common status codes:
| Code | Meaning |
|------|---------|
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (no/invalid token) |
| 403 | Forbidden (wrong role) |
| 404 | Not Found |
| 429 | Too Many Requests (rate limit) |
| 500 | Internal Server Error |
