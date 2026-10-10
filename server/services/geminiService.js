// ============================================================
// ✨ Gemini AI Service (STEP 4.1 + 4.2)
// ============================================================
//
// COMMUNICATION FLOW:
//
//   ┌──────────┐   ┌──────────────┐   ┌──────────────────┐   ┌──────────────┐
//   │  React   │   │  Node.js     │   │  Gemini API      │   │  MongoDB     │
//   │  Client  │   │  Express     │   │  (Google Cloud)  │   │              │
//   └────┬─────┘   └──────┬───────┘   └──────┬───────────┘   └──────┬───────┘
//        │                │                   │                      │
//   1. User asks  ───────►│                   │                      │
//      question           │                   │                      │
//        │           2. Build prompt          │                      │
//        │              with context          │                      │
//        │                │                   │                      │
//        │           3. POST /generate ──────►│                      │
//        │              Content               │                      │
//        │              + system prompt        │                      │
//        │              + disease data         │                      │
//        │              + farm context         │                      │
//        │                │                   │                      │
//        │                │            4. Gemini generates     │
//        │                │               structured response  │
//        │                │                   │                      │
//        │           5. Receive ◄─────────────│                      │
//        │              response              │                      │
//        │                │                   │                      │
//        │           6. Parse & validate      │                      │
//        │              response              │                      │
//        │                │                   │                      │
//        │           7. Save to ──────────────────────────────────►│
//        │              Advisory collection   │                      │
//        │                │                   │                      │
//   8. Display ◄──────────│                   │                      │
//      advisory           │                   │                      │
//
//
// HOW DISEASE DATA FLOWS TO GEMINI:
//
//   ┌──────────────────────────────────────────────────────────────┐
//   │ When a disease is detected by the ML model, the following   │
//   │ data is assembled into a structured prompt for Gemini:      │
//   │                                                              │
//   │  From ML Service:        From User/Farm Context:            │
//   │  ├── disease name         ├── crop type (e.g., tomato)      │
//   │  ├── confidence %         ├── farm location / region        │
//   │  ├── severity level       ├── season (kharif/rabi/zaid)     │
//   │  ├── top-5 predictions    ├── soil type                     │
//   │  └── is_healthy flag      ├── area (acres)                  │
//   │                           └── farming method (organic/conv) │
//   │                                                              │
//   │  These are combined into a structured prompt that tells     │
//   │  Gemini EXACTLY what we need: disease explanation,          │
//   │  treatment (organic + chemical), prevention, and cost.      │
//   └──────────────────────────────────────────────────────────────┘
//
// API KEY SECURITY:
//   • Key stored in .env (GEMINI_API_KEY) — never in code
//   • Key passed as URL parameter (Google's standard for REST API)
//   • Rate limiting applied at route level (10 req/min)
//   • Request timeout: 30 seconds
//   • Fallback responses if API is unavailable
//
// ============================================================

const axios = require("axios");
const config = require("../config/env");
const logger = require("../utils/logger");

// -----------------------------------------------------------
// Gemini API Configuration
// -----------------------------------------------------------
// Default: gemini-2.5-flash-lite (free-tier friendly). Override with GEMINI_MODEL in .env.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const GEMINI_API_URL =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Safety settings to prevent harmful content in agricultural context
const SAFETY_SETTINGS = [
    {
        category: "HARM_CATEGORY_HARASSMENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
        category: "HARM_CATEGORY_HATE_SPEECH",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
        category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
    {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_MEDIUM_AND_ABOVE",
    },
];

// -----------------------------------------------------------
// Utility: sleep helper
// -----------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------------------------------------
// Request Throttling
// -----------------------------------------------------------
// Enforces a minimum gap between consecutive Gemini API calls
// to stay within free-tier rate limits (~2 req / 10 seconds).
// -----------------------------------------------------------
const throttleState = {
    lastRequestTime: 0,
    minIntervalMs: 15000, // Used for direct Gemini free-tier rate limits
    minOpenRouterIntervalMs: 500, // OpenRouter handles higher throughput
};

const throttleRequest = async (useOpenRouter = false) => {
    const now = Date.now();
    const elapsed = now - throttleState.lastRequestTime;
    const interval = useOpenRouter ? throttleState.minOpenRouterIntervalMs : throttleState.minIntervalMs;
    if (elapsed < interval) {
        const waitTime = interval - elapsed;
        logger.info(`Throttling AI request — waiting ${waitTime}ms`);
        await sleep(waitTime);
    }
    throttleState.lastRequestTime = Date.now();
};


// -----------------------------------------------------------
// Exponential Backoff Configuration
// -----------------------------------------------------------
const RETRY_CONFIG = {
    maxRetries: 3,         // Max retry attempts on 429 / 503
    baseDelayMs: 10000,    // Initial delay: 10 seconds
    maxDelayMs: 30000,     // Cap delay at 30 seconds
    jitterMs: 500,         // Random jitter 0–500ms to avoid thundering herd
    retryableStatuses: [429, 503], // Only retry these HTTP codes
};

// -----------------------------------------------------------
// Rate Limiting (In-Memory)
// -----------------------------------------------------------
// Prevents excessive API calls that would:
//   1. Exceed Google's free-tier quota
//   2. Rack up costs
//   3. Indicate abuse
// -----------------------------------------------------------
const rateLimitState = {
    requests: [],
    maxPerMinute: 6,    // Max requests per minute across all users (free-tier safe)
    maxPerUser: 3,      // Max requests per minute per user
};

const checkRateLimit = (userId) => {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Clean old entries
    rateLimitState.requests = rateLimitState.requests.filter(
        (r) => r.timestamp > oneMinuteAgo
    );

    // Check global limit
    if (rateLimitState.requests.length >= rateLimitState.maxPerMinute) {
        throw new Error(
            "AI advisory service is experiencing high demand. " +
            "Please try again in a moment."
        );
    }

    // Check per-user limit
    const userRequests = rateLimitState.requests.filter(
        (r) => r.userId === userId
    );
    if (userRequests.length >= rateLimitState.maxPerUser) {
        throw new Error(
            "You've reached the maximum number of AI queries per minute. " +
            "Please wait before asking another question."
        );
    }

    // Record this request
    rateLimitState.requests.push({ userId, timestamp: now });
};

// ============================================================
// PROMPT TEMPLATES (STEP 4.2)
// ============================================================
//
// Each template is designed for a specific use case and follows
// these principles:
//   1. FARMER-FRIENDLY language (no complex jargon)
//   2. STRUCTURED output (sections with clear headings)
//   3. ACTIONABLE advice (step-by-step recommendations)
//   4. COST-AWARE suggestions (budget-friendly options)
//   5. REGION-AWARE (considers local climate, soil, market)
// ============================================================

// -----------------------------------------------------------
// BASE SYSTEM PROMPT — sets Gemini's persona and format rules
// -----------------------------------------------------------
const SYSTEM_PROMPT = `You are AgriGrow AI — an expert agricultural advisor specialized in Indian and tropical farming.

YOUR RULES:
1. Always respond in clear, farmer-friendly language. Avoid complex scientific jargon.
2. When recommending treatments, ALWAYS provide BOTH organic and chemical options.
3. Include approximate costs in Indian Rupees (₹) when discussing treatments or inputs.
4. Structure your response with clear sections and bullet points.
5. Be practical, specific, and actionable — farmers need step-by-step instructions.
6. Consider the farmer's region, season, and soil type when giving advice.
7. If you are unsure about something, say so honestly rather than guessing.
8. Prioritize organic/natural solutions first, then chemical alternatives.
9. Always include preventive measures to avoid future occurrences.
10. Keep your response concise but comprehensive — aim for 400-600 words.`;

// -----------------------------------------------------------
// PROMPT: Disease Treatment Advisory
// -----------------------------------------------------------
// This is the primary prompt used when a disease is detected
// by the ML model. It combines prediction data with farm
// context to generate comprehensive treatment advice.
// -----------------------------------------------------------
const buildDiseasePrompt = (diseaseData) => {
    const {
        disease,
        confidence,
        severity,
        confidenceLevel,
        cropType,
        location,
        season,
        soilType,
        area,
        farmingMethod,
    } = diseaseData;

    return `${SYSTEM_PROMPT}

DISEASE DETECTION RESULTS:
- Disease Detected: ${disease}
- ML Model Confidence: ${confidence}% (${confidenceLevel || "unknown"} confidence)
- Severity Level: ${severity || "Not assessed"}

FARM CONTEXT:
- Crop: ${cropType || "Not specified"}
- Location/Region: ${location || "India (general)"}
- Current Season: ${season || "Not specified"}
- Soil Type: ${soilType || "Not specified"}
- Farm Area: ${area || "Not specified"}
- Farming Method: ${farmingMethod || "Conventional"}

Please provide a comprehensive advisory with the following EXACT sections:

## 🦠 Disease Explanation
Explain what this disease is, what causes it, and how it affects the plant. Use simple language.

## ⚠️ Severity Assessment
Based on the confidence level and disease type, assess how serious this is and how urgently the farmer should act.

## 🌿 Organic Treatment Options
List 2-3 organic/natural treatment methods with:
- Exact steps to apply
- Materials needed
- Approximate cost (₹)
- How long until results are visible

## 💊 Chemical Treatment Options
List 2-3 chemical/fungicide treatments with:
- Product names and dosage
- Application method
- Approximate cost (₹)
- Safety precautions
- Pre-harvest interval (days)

## 🛡️ Preventive Measures
List 4-5 things the farmer can do to prevent this disease in the future.

## 💰 Estimated Treatment Cost
Provide a cost breakdown:
- Organic treatment: ₹___/acre
- Chemical treatment: ₹___/acre
- Labor cost estimate: ₹___/acre

## 📅 Follow-up Schedule
When should the farmer check again? What signs of improvement to look for?`;
};

// -----------------------------------------------------------
// PROMPT: General Farming Advisory
// -----------------------------------------------------------
const buildGeneralPrompt = (query, context = {}) => {
    let prompt = `${SYSTEM_PROMPT}

`;

    // Add context if available
    if (context.cropType) prompt += `Crop: ${context.cropType}\n`;
    if (context.soilType) prompt += `Soil Type: ${context.soilType}\n`;
    if (context.season) prompt += `Season: ${context.season}\n`;
    if (context.location) prompt += `Location: ${context.location}\n`;
    if (context.area) prompt += `Farm Area: ${context.area}\n`;
    if (context.farmingMethod) prompt += `Farming Method: ${context.farmingMethod}\n`;

    prompt += `\nFarmer's Question: ${query}\n`;
    prompt += `\nPlease provide a detailed, practical response with clear steps where applicable.`;

    return prompt;
};

// -----------------------------------------------------------
// PROMPT: Crop Planning Advisory
// -----------------------------------------------------------
const buildCropPlanningPrompt = (context = {}) => {
    return `${SYSTEM_PROMPT}

FARM DETAILS:
- Location: ${context.location || "Not specified"}
- Soil Type: ${context.soilType || "Not specified"}
- Farm Area: ${context.area || "Not specified"}
- Available Water: ${context.waterSource || "Not specified"}
- Current Season: ${context.season || "Not specified"}
- Budget: ${context.budget || "Not specified"}
- Previous Crops: ${context.previousCrops || "Not specified"}

Farmer's Question: ${context.query || "What crops should I plant this season?"}

Please provide crop planning advice with these sections:

## 🌱 Recommended Crops
List 3-5 suitable crops for this farm with:
- Expected yield per acre
- Market price range
- Growing duration
- Water requirements

## 📊 Cost-Benefit Analysis
For each recommended crop:
- Estimated cost per acre
- Expected revenue per acre
- Profit margin

## 🔄 Crop Rotation Advice
Suggest a rotation plan for the next 2-3 seasons.

## ⚠️ Risks to Consider
Common risks, diseases, and how to mitigate them.`;
};

// -----------------------------------------------------------
// PROMPT: Soil Management Advisory
// -----------------------------------------------------------
const buildSoilPrompt = (context = {}) => {
    return `${SYSTEM_PROMPT}

SOIL INFORMATION:
- Soil Type: ${context.soilType || "Not specified"}
- Soil pH: ${context.soilPH || "Not tested"}
- Location: ${context.location || "Not specified"}
- Current Crop: ${context.cropType || "None"}
- Issues Observed: ${context.issues || "General inquiry"}

Farmer's Question: ${context.query || "How can I improve my soil health?"}

Please provide soil management advice with:

## 🔬 Soil Analysis
Explain the current soil condition and what it means for farming.

## 🌱 Improvement Recommendations
Organic and chemical methods to improve soil, with costs.

## 💧 Water Management
Irrigation tips specific to this soil type.

## 📅 Seasonal Soil Care Calendar
What to do in each season for optimal soil health.`;
};

// -----------------------------------------------------------
// PROMPT: Cost Estimation Enhancement
// -----------------------------------------------------------
const buildCostEstimationPrompt = (context = {}) => {
    return `${SYSTEM_PROMPT}

ESTIMATION REQUEST:
- Crop: ${context.cropName || "Not specified"}
- Area: ${context.area || "Not specified"} ${context.areaUnit || "acres"}
- Location: ${context.location || "India"}
- Season: ${context.season || "Current"}
- Farming Method: ${context.farmingMethod || "Conventional"}

Please provide a detailed cost estimation with:

## 📊 Cost Breakdown (per acre)
| Item | Estimated Cost (₹) |
|------|-------------------|
| Seeds / Seedlings | ₹___ |
| Land Preparation | ₹___ |
| Fertilizers (organic + chemical) | ₹___ |
| Pesticides / Fungicides | ₹___ |
| Irrigation | ₹___ |
| Labor | ₹___ |
| Harvesting | ₹___ |
| Transportation & Storage | ₹___ |
| **Total per Acre** | **₹___** |

## 💹 Revenue Projection
- Expected yield: ___ quintal/acre
- Current market price: ₹___/quintal
- Expected gross revenue: ₹___/acre
- Expected net profit: ₹___/acre
- ROI: ___%

## 💡 Cost Reduction Tips
3-5 practical ways to reduce costs without sacrificing yield.

## ⚠️ Risk Factors
Factors that could increase costs or reduce yield.`;
};

// ============================================================
// CORE FUNCTION: Call Gemini API
// ============================================================
/**
 * Send a prompt to Google Gemini and get a response.
 *
 * JSON REQUEST FORMAT (sent to Gemini):
 *   {
 *     "contents": [
 *       {
 *         "parts": [{ "text": "<full prompt>" }]
 *       }
 *     ],
 *     "generationConfig": {
 *       "temperature": 0.7,      ← controls randomness (0=deterministic, 1=creative)
 *       "topK": 40,              ← considers top 40 tokens
 *       "topP": 0.95,            ← nucleus sampling
 *       "maxOutputTokens": 4096  ← max response length
 *     },
 *     "safetySettings": [...]
 *   }
 *
 * JSON RESPONSE FORMAT (from Gemini):
 *   {
 *     "candidates": [
 *       {
 *         "content": {
 *           "parts": [
 *             { "text": "<generated response>" }
 *           ],
 *           "role": "model"
 *         },
 *         "finishReason": "STOP",
 *         "safetyRatings": [...]
 *       }
 *     ],
 *     "usageMetadata": {
 *       "promptTokenCount": 250,
 *       "candidatesTokenCount": 800,
 *       "totalTokenCount": 1050
 *     }
 *   }
 *
 * @param {string} prompt - The complete prompt to send
 * @param {Object} options - Optional configuration overrides
 * @returns {Object} { text, tokensUsed, finishReason }
 */
const callGemini = async (prompt, options = {}) => {
    const useOpenRouter = !!config.OPENROUTER_API_KEY;

    if (!useOpenRouter && !config.GEMINI_API_KEY) {
        throw new Error(
            "API key is not configured. Set OPENROUTER_API_KEY or GEMINI_API_KEY in server/.env"
        );
    }

    const {
        temperature = 0.7,
        maxTokens = 4096,
        timeout = 30000,
    } = options;

    let requestBody;
    let url;
    let axiosConfig = {
        timeout,
        headers: { "Content-Type": "application/json" },
    };

    if (useOpenRouter) {
        url = "https://openrouter.ai/api/v1/chat/completions";
        axiosConfig.headers["Authorization"] = `Bearer ${config.OPENROUTER_API_KEY}`;
        requestBody = {
            model: config.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature,
            max_tokens: maxTokens,
        };
    } else {
        url = `${GEMINI_API_URL}?key=${config.GEMINI_API_KEY}`;
        requestBody = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                temperature,
                topK: 40,
                topP: 0.95,
                maxOutputTokens: maxTokens,
            },
            safetySettings: SAFETY_SETTINGS,
        };
    }

    // ---------------------------------------------------------
    // Retry loop with exponential backoff for 429 / 503 errors
    // ---------------------------------------------------------
    let lastError = null;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
        try {
            // Throttle: enforce minimum gap between requests
            await throttleRequest(useOpenRouter);

            if (attempt > 0) {
                logger.info(`AI API retry attempt ${attempt}/${RETRY_CONFIG.maxRetries}`);
            }

            const response = await axios.post(url, requestBody, axiosConfig);

            // ---------------------------------------------------
            // Parse response
            // ---------------------------------------------------
            let text, finishReason, tokensUsed;

            if (useOpenRouter) {
                const candidate = response.data?.choices?.[0];
                if (!candidate) throw new Error("OpenRouter returned no candidates.");
                text = candidate.message?.content;
                finishReason = candidate.finish_reason;
                const usage = response.data?.usage || {};
                tokensUsed = {
                    prompt: usage.prompt_tokens || 0,
                    response: usage.completion_tokens || 0,
                    total: usage.total_tokens || 0,
                };
            } else {
                const candidate = response.data?.candidates?.[0];
                if (!candidate) {
                    const blockReason = response.data?.promptFeedback?.blockReason;
                    if (blockReason) {
                        throw new Error(`Gemini blocked the request: ${blockReason}.`);
                    }
                    throw new Error("Gemini returned no candidates in the response.");
                }
                text = candidate.content?.parts?.[0]?.text;
                finishReason = candidate.finishReason;
                const usage = response.data?.usageMetadata || {};
                tokensUsed = {
                    prompt: usage.promptTokenCount || 0,
                    response: usage.candidatesTokenCount || 0,
                    total: usage.totalTokenCount || 0,
                };
            }

            if (!text) {
                throw new Error("AI returned an empty text response.");
            }

            // Warn if response was truncated
            if (finishReason === "MAX_TOKENS" || finishReason === "length") {
                logger.warn("AI response was truncated. Consider increasing max tokens.");
            }

            return { text, tokensUsed, finishReason };
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const body = error.response?.data;

            // Check if this error is retryable (429 or 503)
            const isRetryable = RETRY_CONFIG.retryableStatuses.includes(status);

            if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
                // Use Retry-After header if provided, otherwise exponential backoff
                const retryAfterHeader = error.response?.headers?.["retry-after"];
                let delayMs;

                if (retryAfterHeader) {
                    // Retry-After can be seconds (integer) or a date string
                    const retryAfterSec = parseInt(retryAfterHeader, 10);
                    delayMs = isNaN(retryAfterSec)
                        ? RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt)
                        : retryAfterSec * 1000;
                } else {
                    // Exponential backoff: 2s → 4s → 8s
                    delayMs = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
                }

                // Add random jitter to prevent thundering herd
                const jitter = Math.floor(Math.random() * RETRY_CONFIG.jitterMs);
                delayMs = Math.min(delayMs + jitter, RETRY_CONFIG.maxDelayMs);

                logger.warn(
                    `Gemini API returned ${status} (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}). ` +
                    `Retrying in ${delayMs}ms...`
                );

                await sleep(delayMs);
                continue; // Retry the request
            }

            // Non-retryable error or max retries exhausted
            logger.error(
                `Gemini API error: ${error.message}` +
                (status ? ` (HTTP ${status})` : "") +
                (body?.error?.message ? ` — ${body.error.message}` : "") +
                (attempt > 0 ? ` [after ${attempt + 1} attempts]` : "")
            );
            throw translateGeminiError(error);
        }
    }

    // Should not reach here, but just in case
    throw translateGeminiError(lastError);
};

// -----------------------------------------------------------
// Error Translation
// -----------------------------------------------------------
const translateGeminiError = (error) => {
    // Axios response errors (API returned non-2xx)
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 400) {
            return new Error(
                "Invalid request to AI service. " +
                (data?.error?.message || "Please try rephrasing your question.")
            );
        }

        if (status === 403) {
            return new Error(
                "AI service authentication failed. The API key may be " +
                "invalid or restricted. Contact the administrator."
            );
        }

        if (status === 429) {
            return new Error(
                "AI advisory rate limit exceeded by Google. " +
                "Please wait a moment and try again."
            );
        }

        if (status === 500 || status === 503) {
            return new Error(
                "Google's AI service is temporarily unavailable. " +
                "Please try again in a few minutes."
            );
        }

        return new Error(
            `AI service error (HTTP ${status}): ` +
            (data?.error?.message || "Unknown error")
        );
    }

    // Network errors
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return new Error(
            "AI advisory request timed out. " +
            "The service may be experiencing high load."
        );
    }

    if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        return new Error(
            "Cannot reach the AI advisory service. " +
            "Please check your internet connection."
        );
    }

    // Already translated or generic
    return error;
};

// ============================================================
// PUBLIC API: Disease Advisory
// ============================================================
/**
 * Get disease-specific treatment advisory from Gemini.
 *
 * This is called:
 *   1. Automatically after ML disease detection (in diseaseController)
 *   2. Manually when user requests more details on a detection
 *
 * @param {Object} diseaseData - ML prediction + farm context
 * @param {string} diseaseData.disease - Disease name
 * @param {number} diseaseData.confidence - Model confidence (0-100)
 * @param {string} diseaseData.severity - "none", "moderate", or "high"
 * @param {string} diseaseData.confidenceLevel - "high", "moderate", "low"
 * @param {string} [diseaseData.cropType] - Crop type
 * @param {string} [diseaseData.location] - Geographic region
 * @param {string} [diseaseData.season] - Season
 * @param {string} [diseaseData.soilType] - Soil type
 * @param {string} [userId] - For rate limiting
 * @returns {Object} { text, tokensUsed }
 */
const getDiseaseAdvisory = async (diseaseData, userId) => {
    if (userId) checkRateLimit(userId);

    const prompt = buildDiseasePrompt(diseaseData);

    // Use slightly lower temperature for medical/disease advice (more precise)
    const result = await callGemini(prompt, {
        temperature: 0.5,
        maxTokens: 4096,
    });

    return result;
};

// ============================================================
// PUBLIC API: General Advisory
// ============================================================
/**
 * Get general farming advisory from Gemini.
 *
 * @param {string} query - The farmer's question
 * @param {Object} [context] - Farm context
 * @param {string} [userId] - For rate limiting
 * @returns {Object} { text, tokensUsed }
 */
const getAdvisory = async (query, context = {}, userId) => {
    if (userId) checkRateLimit(userId);

    const prompt = buildGeneralPrompt(query, context);
    return await callGemini(prompt);
};

// ============================================================
// PUBLIC API: Crop Planning Advisory
// ============================================================
const getCropPlanningAdvisory = async (context = {}, userId) => {
    if (userId) checkRateLimit(userId);

    const prompt = buildCropPlanningPrompt(context);
    return await callGemini(prompt);
};

// ============================================================
// PUBLIC API: Soil Management Advisory
// ============================================================
const getSoilAdvisory = async (context = {}, userId) => {
    if (userId) checkRateLimit(userId);

    const prompt = buildSoilPrompt(context);
    return await callGemini(prompt);
};

// ============================================================
// PUBLIC API: Cost Estimation Enhancement
// ============================================================
const getCostEstimationAdvisory = async (context = {}, userId) => {
    if (userId) checkRateLimit(userId);

    const prompt = buildCostEstimationPrompt(context);
    return await callGemini(prompt, { temperature: 0.4 }); // Lower temp for numbers
};

// ============================================================
// FALLBACK RESPONSES
// ============================================================
// Used when Gemini API is unavailable. These provide basic
// advice based on the ML model's built-in disease info,
// ensuring the user is NEVER left without guidance.
// ============================================================

/**
 * Generate a fallback advisory when Gemini is unavailable.
 *
 * @param {Object} diseaseData - ML prediction data
 * @returns {string} Basic fallback advisory text
 */
const getFallbackAdvisory = (diseaseData) => {
    const { disease, confidence, description, recommendation } = diseaseData;

    return `## ⚠️ AI-Powered Advisory Temporarily Unavailable

The detailed AI advisory is currently unavailable. Here is the basic guidance from our detection system:

**Disease Detected:** ${disease || "Unknown"}
**Confidence:** ${confidence || 0}%

### Basic Description
${description || "No description available for this condition."}

### Basic Recommendation
${recommendation || "Please consult a local agricultural expert for specific treatment advice."}

### General Steps
1. **Isolate affected plants** to prevent disease from spreading to healthy plants.
2. **Remove severely infected leaves** and dispose of them (do not compost).
3. **Improve air circulation** around plants by proper spacing.
4. **Avoid overhead watering** — water at the base of plants instead.
5. **Consult your local agricultural extension office** for region-specific treatments.

### 📞 When to Seek Help
- If symptoms are spreading rapidly
- If more than 30% of the crop is affected
- If you cannot identify the disease with certainty

> 💡 *The detailed AI advisory will be available again shortly. Please try again later for comprehensive treatment plans, cost estimates, and organic alternatives.*`;
};

// ============================================================
// CONFIDENCE-ADVISORY COMBINATION LOGIC (STEP 4.2.4)
// ============================================================
/**
 * Combine ML model confidence with Gemini recommendations
 * to produce a final advisory with appropriate caveats.
 *
 * HIGH ML CONFIDENCE + GEMINI ADVISORY:
 *   → Direct treatment recommendation
 *
 * MODERATE ML CONFIDENCE + GEMINI ADVISORY:
 *   → Treatment recommendation + verification suggestion
 *
 * LOW ML CONFIDENCE + GEMINI ADVISORY:
 *   → Multiple possible conditions + expert consultation
 *
 * @param {Object} mlResult - ML prediction result
 * @param {string} geminiText - Gemini's response text
 * @returns {Object} Combined advisory with confidence caveats
 */
const combineMLAndGeminiAdvisory = (mlResult, geminiText) => {
    const { confidence, confidenceLevel, is_healthy, top_predictions } = mlResult;

    let confidencePreamble = "";
    let actionUrgency = "normal";

    if (is_healthy) {
        confidencePreamble =
            "✅ **Good news!** Your plant appears healthy. " +
            "Below are some tips to keep it that way.\n\n";
        actionUrgency = "none";
    } else if (confidenceLevel === "high") {
        confidencePreamble =
            `🎯 **High Confidence Detection (${confidence}%)**\n` +
            "Our AI model is very certain about this diagnosis. " +
            "Follow the treatment recommendations below.\n\n";
        actionUrgency = "high";
    } else if (confidenceLevel === "moderate") {
        confidencePreamble =
            `⚠️ **Moderate Confidence Detection (${confidence}%)**\n` +
            "Our AI model is fairly confident about this diagnosis, but we recommend " +
            "verifying with a local agricultural expert before applying chemical treatments.\n\n";
        actionUrgency = "moderate";

        // Add alternative diagnoses
        if (top_predictions && top_predictions.length > 1) {
            confidencePreamble += "**Other possible conditions:**\n";
            top_predictions.slice(1, 3).forEach((pred) => {
                confidencePreamble += `- ${pred.class} (${pred.probability}% probability)\n`;
            });
            confidencePreamble += "\n";
        }
    } else if (confidenceLevel === "low") {
        confidencePreamble =
            `🔍 **Low Confidence Detection (${confidence}%)**\n` +
            "Our AI model is uncertain about this diagnosis. The recommendations below " +
            "are based on the most likely condition, but **we strongly recommend** consulting " +
            "a local agricultural expert before applying any treatments.\n\n";
        actionUrgency = "low";

        if (top_predictions && top_predictions.length > 1) {
            confidencePreamble += "**Multiple possible conditions detected:**\n";
            top_predictions.slice(0, 3).forEach((pred) => {
                confidencePreamble += `- ${pred.class} (${pred.probability}% probability)\n`;
            });
            confidencePreamble += "\n";
        }
    } else {
        confidencePreamble =
            `❓ **Very Low Confidence (${confidence}%)**\n` +
            "Our AI model cannot confidently identify this condition. " +
            "Please take a clearer photo or consult a local expert.\n\n";
        actionUrgency = "very_low";
    }

    return {
        preamble: confidencePreamble,
        advisory: geminiText,
        fullAdvisory: confidencePreamble + geminiText,
        actionUrgency,
        confidenceLevel,
        confidence,
    };
};

module.exports = {
    // Core
    callGemini,
    // Advisory types
    getAdvisory,
    getDiseaseAdvisory,
    getCropPlanningAdvisory,
    getSoilAdvisory,
    getCostEstimationAdvisory,
    // Utilities
    getFallbackAdvisory,
    combineMLAndGeminiAdvisory,
    checkRateLimit,
    // Prompt builders (exported for testing)
    buildDiseasePrompt,
    buildGeneralPrompt,
    buildCropPlanningPrompt,
    buildSoilPrompt,
    buildCostEstimationPrompt,
    SYSTEM_PROMPT,
};
