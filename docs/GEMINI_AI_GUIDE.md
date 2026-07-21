# ✨ Gemini AI Integration — Architecture Guide

> **STEP 4.1** — Gemini AI Integration Design  
> **STEP 4.2** — Gemini Prompt & Response Handling

---

## 1. Complete Communication Flow

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                  AgriGrow — AI Advisory Pipeline                              ║
║                                                                                ║
║  ┌──────────────────┐                                                          ║
║  │   REACT CLIENT   │                                                          ║
║  │──────────────────│                                                          ║
║  │ • Ask questions  │                                                          ║
║  │ • View advisory  │                                                          ║
║  │ • Rate responses │                                                          ║
║  │ • Bookmark advice│                                                          ║
║  └────────┬─────────┘                                                          ║
║           │                                                                    ║
║     POST /api/advisory/disease                                                 ║
║     {                                                                          ║
║       disease: "Tomato — Early Blight",                                        ║
║       confidence: 94.32,                                                       ║
║       cropType: "Tomato",                                                      ║
║       location: "Maharashtra",                                                 ║
║       season: "Kharif",                                                        ║
║       soilType: "Black soil"                                                   ║
║     }                                                                          ║
║           │                                                                    ║
║  ═════════▼══════════════════════════════════════════════════════════           ║
║  ║             NODE.JS EXPRESS SERVER (port 5000)              ║               ║
║  ║─────────────────────────────────────────────────────────────║               ║
║  ║                                                             ║               ║
║  ║  1. ┌─────────────┐                                         ║               ║
║  ║     │ JWT protect  │ Verify authentication                   ║               ║
║  ║     └──────┬──────┘                                         ║               ║
║  ║            │                                                 ║               ║
║  ║  2. ┌──────▼──────┐                                         ║               ║
║  ║     │ Joi validate│ Validate request body                    ║               ║
║  ║     └──────┬──────┘                                         ║               ║
║  ║            │                                                 ║               ║
║  ║  3. ┌──────▼─────────────┐                                   ║               ║
║  ║     │ Rate limit check   │ In-memory: 10/min per user       ║               ║
║  ║     │                    │ Express: 20/min per IP           ║               ║
║  ║     └──────┬─────────────┘                                   ║               ║
║  ║            │                                                 ║               ║
║  ║  4. ┌──────▼──────────────────────────┐                     ║               ║
║  ║     │ Build Structured Prompt          │                     ║               ║
║  ║     │                                  │                     ║               ║
║  ║     │ SYSTEM_PROMPT:                   │                     ║               ║
║  ║     │  "You are AgriGrow AI..."      │                     ║               ║
║  ║     │                                  │                     ║               ║
║  ║     │ DISEASE DATA:                    │                     ║               ║
║  ║     │  Disease: Tomato Early Blight    │                     ║               ║
║  ║     │  Confidence: 94.32%              │                     ║               ║
║  ║     │  Severity: moderate              │                     ║               ║
║  ║     │                                  │                     ║               ║
║  ║     │ FARM CONTEXT:                    │                     ║               ║
║  ║     │  Crop: Tomato                    │                     ║               ║
║  ║     │  Location: Maharashtra           │                     ║               ║
║  ║     │  Season: Kharif                  │                     ║               ║
║  ║     │  Soil: Black soil                │                     ║               ║
║  ║     │                                  │                     ║               ║
║  ║     │ REQUIRED SECTIONS:               │                     ║               ║
║  ║     │  🦠 Disease Explanation           │                     ║               ║
║  ║     │  ⚠️ Severity Assessment          │                     ║               ║
║  ║     │  🌿 Organic Treatment            │                     ║               ║
║  ║     │  💊 Chemical Treatment           │                     ║               ║
║  ║     │  🛡️ Preventive Measures          │                     ║               ║
║  ║     │  💰 Estimated Cost               │                     ║               ║
║  ║     │  📅 Follow-up Schedule           │                     ║               ║
║  ║     └──────┬───────────────────────────┘                     ║               ║
║  ║            │                                                 ║               ║
║  ╚════════════╪═════════════════════════════════════════════════╝               ║
║               │                                                                ║
║        5. POST to Gemini API                                                   ║
║           https://generativelanguage.googleapis.com/v1beta/                     ║
║           models/gemini-2.0-flash:generateContent                              ║
║               │                                                                ║
║  ┌────────────▼──────────────────────────────────────────────┐                 ║
║  │           GOOGLE GEMINI API                               │                 ║
║  │───────────────────────────────────────────────────────────│                 ║
║  │                                                           │                 ║
║  │  • Receives structured prompt                             │                 ║
║  │  • Processes with gemini-2.0-flash model                  │                 ║
║  │  • Applies safety filters                                 │                 ║
║  │  • Generates structured advisory response                 │                 ║
║  │  • Returns JSON with candidates + usage metadata          │                 ║
║  │                                                           │                 ║
║  └────────────┬──────────────────────────────────────────────┘                 ║
║               │                                                                ║
║        6. JSON Response from Gemini                                            ║
║               │                                                                ║
║  ═════════════╪═════════════════════════════════════════════════════            ║
║  ║            ▼                                                 ║              ║
║  ║  7. ┌─────────────────────────┐                              ║              ║
║  ║     │ Parse & validate        │ Check for empty response     ║              ║
║  ║     │ Gemini response         │ Check for safety blocks      ║              ║
║  ║     │                         │ Extract text + tokens        ║              ║
║  ║     └──────┬──────────────────┘                              ║              ║
║  ║            │                                                  ║              ║
║  ║  8. ┌──────▼──────────────────────┐                          ║              ║
║  ║     │ Combine ML + Gemini         │                          ║              ║
║  ║     │ combineMLAndGeminiAdvisory()│                          ║              ║
║  ║     │                             │                          ║              ║
║  ║     │ 🎯 High (≥85%):            │                          ║              ║
║  ║     │   "High confidence. Follow  │                          ║              ║
║  ║     │    the treatment plan."     │                          ║              ║
║  ║     │                             │                          ║              ║
║  ║     │ ⚠️ Moderate (65-84%):      │                          ║              ║
║  ║     │   "Fairly confident. Verify │                          ║              ║
║  ║     │    with expert." + alt.     │                          ║              ║
║  ║     │                             │                          ║              ║
║  ║     │ 🔍 Low (50-64%):           │                          ║              ║
║  ║     │   "Uncertain. Consult       │                          ║              ║
║  ║     │    expert." + alternatives  │                          ║              ║
║  ║     └──────┬──────────────────────┘                          ║              ║
║  ║            │                                                  ║              ║
║  ║  9. ┌──────▼──────────────────┐                              ║              ║
║  ║     │ Save to MongoDB          │ Advisory collection +       ║              ║
║  ║     │ (advisories collection)  │ disease_reports.aiAdvisory  ║              ║
║  ║     └──────┬──────────────────┘                              ║              ║
║  ║            │                                                  ║              ║
║  ║  10. Return JSON to frontend                                 ║              ║
║  ╚════════════╪══════════════════════════════════════════════════╝              ║
║               │                                                                ║
║  ┌────────────▼──────────────┐                                                 ║
║  │   REACT CLIENT            │                                                 ║
║  │   Displays:               │                                                 ║
║  │   • Confidence preamble   │                                                 ║
║  │   • Disease explanation   │                                                 ║
║  │   • Organic treatments    │                                                 ║
║  │   • Chemical treatments   │                                                 ║
║  │   • Cost estimates (₹)   │                                                 ║
║  │   • Prevention tips       │                                                 ║
║  │   • Follow-up schedule    │                                                 ║
║  │   • Action urgency badge  │                                                 ║
║  └───────────────────────────┘                                                 ║
╚══════════════════════════════════════════════════════════════════════════════════╝
```

---

## 2. How Disease Detection Data Flows to Gemini

When the ML model detects a disease, the following data is assembled
and sent to Gemini as a structured prompt:

```
   ┌────────────────────────────────────────────────────────────────┐
   │                  DATA SOURCES FOR GEMINI PROMPT                │
   ├────────────────────────────┬───────────────────────────────────┤
   │  FROM ML MODEL PREDICTION  │  FROM USER/FARM CONTEXT           │
   │  (automatic)               │  (user provides)                  │
   ├────────────────────────────┼───────────────────────────────────┤
   │  • Disease name             │  • Crop type                      │
   │    "Tomato — Early Blight"  │    "Tomato"                       │
   │                             │                                   │
   │  • Confidence: 94.32%       │  • Location / region              │
   │                             │    "Maharashtra, India"            │
   │  • Severity: "moderate"     │                                   │
   │                             │  • Season                         │
   │  • Confidence level: "high" │    "Kharif"                       │
   │                             │                                   │
   │  • Top 5 predictions        │  • Soil type                      │
   │    1. Early Blight  94.32%  │    "Black cotton soil"             │
   │    2. Late Blight    3.21%  │                                   │
   │    3. Septoria       1.05%  │  • Area: "5 acres"                │
   │    4. Target Spot    0.89%  │                                   │
   │    5. Bacterial Spot 0.53%  │  • Farming method                 │
   │                             │    "Conventional" / "Organic"      │
   │  • is_healthy: false        │                                   │
   └────────────────────────────┴───────────────────────────────────┘
                    │                           │
                    └─────────┬─────────────────┘
                              │
                    Combined into a single
                    structured prompt with
                    SYSTEM_PROMPT persona
                              │
                              ▼
                    ┌─────────────────────┐
                    │  Gemini API Call     │
                    │  Temperature: 0.5   │ ← Lower = more precise
                    │  Max tokens: 4096   │
                    │  Safety filters: ON │
                    └─────────────────────┘
```

---

## 3. JSON Request/Response Structures

### 3a. Node.js → Gemini API Request

```json
{
    "contents": [
        {
            "parts": [
                {
                    "text": "You are AgriGrow AI — an expert agricultural advisor...\n\nDISEASE DETECTION RESULTS:\n- Disease Detected: Tomato — Early Blight\n- ML Model Confidence: 94.32% (high confidence)\n- Severity Level: moderate\n\nFARM CONTEXT:\n- Crop: Tomato\n- Location/Region: Maharashtra, India\n- Current Season: Kharif\n- Soil Type: Black cotton soil\n- Farm Area: 5 acres\n- Farming Method: Conventional\n\nPlease provide a comprehensive advisory with these sections:\n\n## 🦠 Disease Explanation\n...\n## 🌿 Organic Treatment\n...\n## 💊 Chemical Treatment\n...\n## 🛡️ Prevention\n...\n## 💰 Cost\n...\n## 📅 Follow-up\n..."
                }
            ]
        }
    ],
    "generationConfig": {
        "temperature": 0.5,
        "topK": 40,
        "topP": 0.95,
        "maxOutputTokens": 4096
    },
    "safetySettings": [
        { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
        { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
        { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
        { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
    ]
}
```

### 3b. Gemini API → Node.js Response

```json
{
    "candidates": [
        {
            "content": {
                "parts": [
                    {
                        "text": "## 🦠 Disease Explanation\nEarly Blight is a common fungal disease caused by **Alternaria solani**...\n\n## ⚠️ Severity Assessment\n...\n\n## 🌿 Organic Treatment Options\n### 1. Neem Oil Spray\n- Mix 5ml neem oil per litre of water...\n- Cost: ₹150-200/acre...\n\n## 💊 Chemical Treatment Options\n### 1. Mancozeb 75% WP\n- Dosage: 2.5g per litre...\n- Cost: ₹300-400/acre...\n\n## 🛡️ Preventive Measures\n1. Practice crop rotation...\n\n## 💰 Estimated Treatment Cost\n- Organic: ₹500-800/acre\n- Chemical: ₹800-1200/acre\n\n## 📅 Follow-up Schedule\n- Check again in 5-7 days..."
                    }
                ],
                "role": "model"
            },
            "finishReason": "STOP",
            "safetyRatings": [
                { "category": "HARM_CATEGORY_HARASSMENT", "probability": "NEGLIGIBLE" }
            ]
        }
    ],
    "usageMetadata": {
        "promptTokenCount": 350,
        "candidatesTokenCount": 850,
        "totalTokenCount": 1200
    }
}
```

### 3c. Node.js → React Frontend Response

```json
{
    "success": true,
    "message": "Disease advisory generated",
    "data": {
        "id": "65b2c3d4e5f6a7b8c9d0e1f2",
        "preamble": "🎯 **High Confidence Detection (94.32%)**\nOur AI model is very certain about this diagnosis. Follow the treatment recommendations below.\n\n",
        "advisory": "## 🦠 Disease Explanation\nEarly Blight is a common fungal disease...",
        "fullAdvisory": "🎯 **High Confidence Detection (94.32%)**\n...\n\n## 🦠 Disease Explanation\n...",
        "actionUrgency": "high",
        "confidenceLevel": "high",
        "confidence": 94.32,
        "isFallback": false,
        "tokensUsed": {
            "prompt": 350,
            "response": 850,
            "total": 1200
        },
        "diseaseReportId": "65a1b2c3d4e5f6a7b8c9d0e1",
        "createdAt": "2024-02-13T14:00:00.000Z"
    }
}
```

---

## 4. Prompt Template Examples (STEP 4.2.1)

### 4a. Disease Treatment Prompt

The disease prompt is the most important template. It instructs Gemini to generate
a comprehensive response with **7 required sections**:

```
SYSTEM PROMPT (persona):
  "You are AgriGrow AI — an expert agricultural advisor specialized
   in Indian and tropical farming."

RULES (10 rules):
  1. Farmer-friendly language (no jargon)
  2. BOTH organic AND chemical treatments
  3. Costs in Indian Rupees (₹)
  4. Structured sections with bullet points
  5. Practical, step-by-step instructions
  6. Region-aware advice
  7. Honest uncertainty when unsure
  8. Prioritize organic → then chemical
  9. Include preventive measures
  10. 400-600 words

REQUIRED OUTPUT SECTIONS:
  🦠 Disease Explanation     → What it is, what causes it
  ⚠️ Severity Assessment    → How urgent, action needed
  🌿 Organic Treatment       → 2-3 options with cost per acre
  💊 Chemical Treatment      → 2-3 products with dosage + safety
  🛡️ Preventive Measures    → 4-5 future prevention steps
  💰 Estimated Cost          → Cost breakdown (organic vs chemical)
  📅 Follow-up Schedule      → When to check, signs of improvement
```

### 4b. Crop Planning Prompt

```
REQUIRED OUTPUT SECTIONS:
  🌱 Recommended Crops       → 3-5 suitable crops with yield/price
  📊 Cost-Benefit Analysis   → Per-crop cost, revenue, profit margin
  🔄 Crop Rotation Advice    → 2-3 season rotation plan
  ⚠️ Risks to Consider      → Common risks and mitigation
```

### 4c. Soil Management Prompt

```
REQUIRED OUTPUT SECTIONS:
  🔬 Soil Analysis           → Current condition analysis
  🌱 Improvement Recs        → Organic + chemical methods with costs
  💧 Water Management        → Irrigation tips for this soil type
  📅 Seasonal Care            → Calendar of soil care activities
```

### 4d. Cost Estimation Prompt

```
REQUIRED OUTPUT SECTIONS:
  📊 Cost Breakdown          → Table of all costs per acre (₹)
  💹 Revenue Projection      → Yield, price, revenue, profit, ROI
  💡 Cost Reduction Tips     → 3-5 practical savings ideas
  ⚠️ Risk Factors           → What could increase costs
```

---

## 5. Confidence-Advisory Combination (STEP 4.2.4)

The ML model's confidence level determines how the advisory is presented:

```
ML CONFIDENCE          PREAMBLE                        ACTION URGENCY
──────────────────────────────────────────────────────────────────────

≥ 85% (HIGH)      🎯 "High confidence.              "high"
                      Follow the treatment plan."
                      → Direct treatment advice

65-84% (MODERATE)  ⚠️ "Fairly confident.             "moderate"
                       Verify with expert."
                      → Advice + alternative diagnoses
                      → Show top 2 alternatives

50-64% (LOW)       🔍 "Uncertain. Multiple            "low"
                       possible conditions."
                      → Show top 3 alternatives
                      → "Strongly recommend expert"

< 50% (VERY LOW)   ❓ "Cannot confidently              "very_low"
                       identify. Retake photo
                       or consult expert."
                      → Basic guidance only
```

### Example Combined Output (HIGH confidence):

```markdown
🎯 **High Confidence Detection (94.32%)**
Our AI model is very certain about this diagnosis.
Follow the treatment recommendations below.

## 🦠 Disease Explanation
Early Blight is a common fungal disease caused by Alternaria solani...

## 🌿 Organic Treatment Options
### 1. Neem Oil Spray
- Mix 5ml neem oil per litre of water...
- Cost: ₹150-200/acre...
```

### Example Combined Output (MODERATE confidence):

```markdown
⚠️ **Moderate Confidence Detection (72.5%)**
Our AI model is fairly confident about this diagnosis,
but we recommend verifying with a local agricultural expert.

**Other possible conditions:**
- Tomato — Late Blight (15.3% probability)
- Tomato — Septoria Leaf Spot (8.1% probability)

## 🦠 Disease Explanation
Early Blight is a common fungal disease...
```

---

## 6. Error Handling & Fallback (STEP 4.2.3)

### Fallback Flow:

```
             Normal Flow                    Fallback Flow
        ┌─────────────────┐            ┌─────────────────┐
        │  Gemini API     │            │  Gemini API     │
        │  available?     │            │  UNAVAILABLE    │
        └─────┬───────────┘            └─────┬───────────┘
              │ YES                          │ ERROR
              ▼                              ▼
        ┌─────────────┐               ┌──────────────────┐
        │ Call Gemini  │               │ getFallback-     │
        │ API with     │               │ Advisory()       │
        │ structured   │               │                  │
        │ prompt       │               │ Uses ML model's  │
        └─────┬───────┘               │ built-in disease │
              │                        │ descriptions &   │
              ▼                        │ recommendations  │
        ┌─────────────┐               └────────┬─────────┘
        │ Validate    │                        │
        │ response    │                        ▼
        │ length ≥100 │               ┌──────────────────┐
        └─────┬───────┘               │ Mark as fallback │
              │                        │ isFallback=true  │
              ▼                        └────────┬─────────┘
        ┌─────────────┐                        │
        │ Combine ML  │                        ▼
        │ + Gemini    │               ┌──────────────────┐
        └─────┬───────┘               │ Save to MongoDB  │
              │                        │ with isFallback  │
              ▼                        │ flag             │
        ┌─────────────┐               └────────┬─────────┘
        │ Save to     │                        │
        │ MongoDB     │                        ▼
        └─────┬───────┘               ┌──────────────────┐
              │                        │ Return to client │
              ▼                        │ with notice      │
        ┌─────────────┐               └──────────────────┘
        │ Return to   │
        │ client      │
        └─────────────┘
```

### What the Fallback Contains:

```
## ⚠️ AI-Powered Advisory Temporarily Unavailable

The detailed AI advisory is currently unavailable. Here is the
basic guidance from our detection system:

**Disease Detected:** Tomato — Early Blight
**Confidence:** 94.32%

### Basic Description
{description from ML model's DISEASE_INFO database}

### Basic Recommendation
{recommendation from ML model's DISEASE_INFO database}

### General Steps
1. Isolate affected plants
2. Remove severely infected leaves
3. Improve air circulation
4. Avoid overhead watering
5. Consult local agricultural extension office
```

---

## 7. Security Best Practices

### API Key Management

```
NEVER IN CODE:
  ❌ const API_KEY = "AIzaSyABC..."     // EXPOSED!
  ❌ fetch(url + "?key=AIzaSyABC...")    // EXPOSED!

ALWAYS IN .env:
  ✅ GEMINI_API_KEY=AIzaSyABC...        // In server/.env
  ✅ const key = config.GEMINI_API_KEY   // Read from env.js
  ✅ .gitignore includes .env            // Never committed

ENV VARIABLE FLOW:
  server/.env  →  config/env.js  →  services/geminiService.js
  (file)           (validation)      (usage)
```

### Rate Limiting (3 layers)

```
LAYER 1: Express Rate Limiter (routes)
  ├── 20 requests per minute per IP
  ├── Applied to all POST /advisory/* routes
  └── Returns 429 Too Many Requests

LAYER 2: In-Memory Service Rate Limit (geminiService.js)
  ├── 30 requests per minute globally
  ├── 10 requests per minute per user
  └── Prevents single user from consuming all quota

LAYER 3: Google API Quota (external)
  ├── 60 requests per minute (free tier)
  ├── 1,500 requests per day (free tier)
  └── Returns 429 from Google APIs
```

### Request Security

```
✅ JWT authentication required on ALL advisory routes
✅ Joi validation on ALL POST request bodies
✅ Input sanitization (express-mongo-sanitize)
✅ Owner-only access on PATCH/DELETE operations
✅ MongoDB ObjectId validation on :id params  
✅ Query length limit (2000 characters)
✅ Timeout on Gemini API calls (30 seconds)
✅ Safety settings to prevent harmful content
```

---

## 8. API Route Summary

| Method | Endpoint | Description | Rate Limited |
|---|---|---|---|
| `POST` | `/api/advisory/ask` | General farming advisory | ✅ 20/min |
| `POST` | `/api/advisory/disease` | Disease treatment advisory | ✅ 20/min |
| `POST` | `/api/advisory/crop-plan` | Crop planning advisory | ✅ 20/min |
| `POST` | `/api/advisory/soil` | Soil management advisory | ✅ 20/min |
| `POST` | `/api/advisory/cost` | Cost estimation advisory | ✅ 20/min |
| `GET` | `/api/advisory/history` | Advisory history (paginated) | ❌ |
| `GET` | `/api/advisory/stats` | Advisory usage statistics | ❌ |
| `GET` | `/api/advisory/:id` | Single advisory record | ❌ |
| `PATCH` | `/api/advisory/:id` | Rate, bookmark, add notes | ❌ |
| `DELETE` | `/api/advisory/:id` | Delete advisory record | ❌ |

---

## 9. File Structure

```
server/
├── services/
│   └── geminiService.js         ← ENHANCED: 5 prompt templates,
│                                   callGemini(), rate limiting,
│                                   fallback, ML+Gemini combiner
│
├── models/
│   └── Advisory.js              ← ENHANCED: Token tracking,
│                                   disease report linking,
│                                   action urgency, user notes
│
├── controllers/
│   ├── advisoryController.js    ← ENHANCED: 10 handlers for
│   │                               5 advisory types + CRUD + stats
│   └── diseaseController.js     ← UPDATED: Uses getDiseaseAdvisory()
│                                   with fallback & confidence combo
│
├── routes/
│   └── advisoryRoutes.js        ← ENHANCED: 10 routes with
│                                   Joi validation & rate limiting
│
└── docs/
    └── GEMINI_AI_GUIDE.md       ← This documentation
```

---

## 10. Running & Testing

### Test General Advisory:
```bash
curl -X POST http://localhost:5000/api/advisory/ask \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "How often should I water my tomato plants in summer?",
    "context": {
      "cropType": "Tomato",
      "soilType": "Sandy loam",
      "season": "Kharif",
      "location": "Maharashtra"
    }
  }'
```

### Test Disease Advisory:
```bash
curl -X POST http://localhost:5000/api/advisory/disease \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "disease": "Tomato — Early Blight",
    "confidence": 94.32,
    "confidenceLevel": "high",
    "severity": "moderate",
    "isHealthy": false,
    "cropType": "Tomato",
    "location": "Maharashtra, India",
    "season": "Kharif",
    "soilType": "Black cotton soil",
    "area": "5 acres",
    "farmingMethod": "Conventional"
  }'
```

### Test Crop Planning:
```bash
curl -X POST http://localhost:5000/api/advisory/crop-plan \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "location": "Punjab, India",
    "soilType": "Alluvial",
    "season": "Rabi",
    "area": "10 acres",
    "waterSource": "Canal + Borewell"
  }'
```

### Test Cost Estimation:
```bash
curl -X POST http://localhost:5000/api/advisory/cost \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "cropName": "Wheat",
    "area": "10",
    "areaUnit": "acres",
    "location": "Punjab, India",
    "season": "Rabi"
  }'
```
