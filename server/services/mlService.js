// ============================================================
// 🧠 ML Service Client (STEP 3.2)
// ============================================================
//
// COMMUNICATION FLOW (Text Diagram):
//
//   ┌──────────┐   ┌────────────────┐   ┌──────────────────┐   ┌──────────────┐
//   │  React   │   │  Node.js       │   │  Python ML       │   │  TensorFlow  │
//   │  Client  │   │  Express API   │   │  FastAPI Server  │   │  Keras Model │
//   └────┬─────┘   └──────┬─────────┘   └──────┬───────────┘   └──────┬───────┘
//        │                │                     │                      │
//   1. Upload  ──────────►│                     │                      │
//      image              │                     │                      │
//      (multipart)        │                     │                      │
//        │           2. Multer saves       │                      │
//        │              to disk            │                      │
//        │                │                     │                      │
//        │           3. Stream image ──────────►│                      │
//        │              via HTTP POST           │                      │
//        │              (FormData)              │                      │
//        │                │                4. Load image          │
//        │                │                   Resize to 224×224   │
//        │                │                   Normalize           │
//        │                │                     │                      │
//        │                │                5. model.predict() ────────►│
//        │                │                     │                      │
//        │                │                6. Get top-5 ◄─────────────│
//        │                │                   predictions             │
//        │                │                     │                      │
//        │           7. Receive JSON ◄──────────│                      │
//        │              prediction              │                      │
//        │                │                     │                      │
//        │           8. Apply confidence        │                      │
//        │              threshold checks        │                      │
//        │                │                     │                      │
//        │           9. Save to MongoDB         │                      │
//        │              (Disease collection)    │                      │
//        │                │                     │                      │
//   10. Receive ◄─────────│                     │                      │
//       result            │                     │                      │
//       + advisory        │                     │                      │
//
// WHY A PYTHON MICROSERVICE (not direct Node.js)?
// ─────────────────────────────────────────────────
//   1. TensorFlow/Keras are Python-native libraries. Node.js bindings
//      (tfjs) exist but have limited model compatibility and slower
//      inference for complex models.
//
//   2. The .h5 model was trained in Python (Keras). Loading it in
//      Python uses the exact same runtime environment, eliminating
//      conversion errors and compatibility issues.
//
//   3. Python has a MUCH richer ecosystem for image processing
//      (Pillow, OpenCV, scikit-image) and ML (NumPy, SciPy).
//
//   4. INDEPENDENT SCALING: The ML service can run on a GPU server
//      while Node.js runs on a smaller CPU instance. Each service
//      scales according to its own bottlenecks.
//
//   5. TEAM SEPARATION: ML engineers work in Python; web engineers
//      work in Node.js. The REST API is the contract between them.
//
//   6. FAULT ISOLATION: If the ML model crashes, the main API
//      server continues running (graceful degradation).
//
// ERROR HANDLING STRATEGY:
//   • Retry with exponential backoff (up to 2 retries)
//   • Timeout: 60 seconds per request
//   • Circuit breaker pattern (if service is down, fail fast)
//   • Graceful fallback messages for the user
// ============================================================

const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const config = require("../config/env");
const logger = require("../utils/logger");
const { ML_SERVICE, PREDICTION } = require("../utils/constants");

// -----------------------------------------------------------
// Axios instance for ML communication
// -----------------------------------------------------------
const mlClient = axios.create({
    baseURL: config.ML_SERVICE_URL,
    timeout: ML_SERVICE.TIMEOUT,
    // Increase max content length for image uploads
    maxContentLength: 50 * 1024 * 1024,  // 50 MB
    maxBodyLength: 50 * 1024 * 1024,
});

// -----------------------------------------------------------
// Circuit Breaker State
// -----------------------------------------------------------
// Prevents hammering a down service with requests.
// After 3 consecutive failures, the circuit "opens" and
// all requests fail immediately for 30 seconds.
// -----------------------------------------------------------
let circuitState = {
    failures: 0,
    lastFailure: null,
    isOpen: false,
    openedAt: null,
};

const CIRCUIT_THRESHOLD = 15;        // failures before opening
const CIRCUIT_RESET_TIME = 30000;    // 30 seconds cool-down

const checkCircuitBreaker = () => {
    if (!circuitState.isOpen) return; // Circuit is closed — allow requests

    const timeSinceOpen = Date.now() - circuitState.openedAt;
    if (timeSinceOpen > CIRCUIT_RESET_TIME) {
        // Reset circuit — allow one test request
        logger.info("ML Service circuit breaker: half-open (testing reconnection)");
        circuitState.isOpen = false;
        circuitState.failures = 0;
        return;
    }

    throw new Error(
        "ML service is temporarily unavailable. The system will retry " +
        `in ${Math.ceil((CIRCUIT_RESET_TIME - timeSinceOpen) / 1000)} seconds.`
    );
};

const recordFailure = () => {
    circuitState.failures += 1;
    circuitState.lastFailure = Date.now();

    if (circuitState.failures >= CIRCUIT_THRESHOLD) {
        circuitState.isOpen = true;
        circuitState.openedAt = Date.now();
        logger.error(
            `ML Service circuit breaker OPENED after ${circuitState.failures} failures`
        );
    }
};

const recordSuccess = () => {
    if (circuitState.failures > 0) {
        logger.info("ML Service circuit breaker: closed (service recovered)");
    }
    circuitState.failures = 0;
    circuitState.isOpen = false;
    circuitState.openedAt = null;
};

// -----------------------------------------------------------
// Retry with exponential backoff
// -----------------------------------------------------------
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Execute a function with retry logic.
 *
 * @param {Function} fn          - Async function to execute
 * @param {number}   maxRetries  - Maximum retry attempts
 * @param {number}   baseDelay   - Initial delay in ms (doubled each retry)
 * @returns {*} Result from the function
 */
const withRetry = async (fn, maxRetries = ML_SERVICE.RETRY_ATTEMPTS, baseDelay = ML_SERVICE.RETRY_DELAY) => {
    let lastError;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;

            // Don't retry on client errors (4xx) — only server/network errors
            if (error.response && error.response.status >= 400 && error.response.status < 500) {
                throw error;
            }

            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
                logger.warn(
                    `ML Service: attempt ${attempt + 1}/${maxRetries + 1} failed. ` +
                    `Retrying in ${delay}ms... (${error.message})`
                );
                await sleep(delay);
            }
        }
    }

    throw lastError;
};

// ============================================================
// MAIN FUNCTION: Send image for disease prediction
// ============================================================
/**
 * Send an image to the Python ML microservice for disease prediction.
 *
 * REQUEST FORMAT (sent to Python):
 *   POST /predict
 *   Content-Type: multipart/form-data
 *   Body: file=<image binary data>
 *
 * EXPECTED RESPONSE (from Python):
 *   {
 *     "success": true,
 *     "prediction": "Tomato — Early Blight",
 *     "confidence": 94.32,
 *     "is_healthy": false,
 *     "description": "Caused by Alternaria solani...",
 *     "recommendation": "Apply fungicides...",
 *     "top_predictions": [
 *       { "class": "Tomato — Early Blight", "probability": 94.32 },
 *       { "class": "Tomato — Late Blight",  "probability": 3.21 },
 *       ...
 *     ]
 *   }
 *
 * @param {string} imagePath - Absolute path to the uploaded image file
 * @returns {Object} Processed prediction result
 */
const predictDisease = async (imagePath) => {
    // Step 1: Check circuit breaker
    checkCircuitBreaker();

    // Step 2: Verify file exists before sending
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
    }

    try {
        // Step 3: Send image to ML service with retry
        const result = await withRetry(async () => {
            const form = new FormData();
            form.append("file", fs.createReadStream(imagePath));

            logger.info(`Sending image to ML service: ${imagePath}`);

            const response = await mlClient.post("/predict", form, {
                headers: {
                    ...form.getHeaders(),
                },
            });

            return response.data;
        });

        // Step 4: Record successful communication
        recordSuccess();

        // Step 5: Validate response structure
        if (!result || !result.prediction) {
            throw new Error("ML service returned an invalid response format");
        }

        // Step 6: Apply confidence threshold logic
        const processedResult = applyConfidenceThresholds(result);

        logger.info(
            `Prediction: "${processedResult.prediction}" ` +
            `(${processedResult.confidence}% confidence) ` +
            `[${processedResult.confidenceLevel}]`
        );

        return processedResult;
    } catch (error) {
        // Record failure for circuit breaker
        if (!error.response || error.response.status >= 500 || error.code) {
            recordFailure();
        }

        // Translate errors into user-friendly messages
        throw translateMLError(error);
    }
};

// -----------------------------------------------------------
// Confidence Threshold Processing
// -----------------------------------------------------------
/**
 * Apply confidence threshold logic to the prediction result.
 *
 * Confidence Levels:
 *   ≥ 85%   → "high"     → Result is shown directly
 *   65-84%  → "moderate" → Result shown with advisory to verify
 *   50-64%  → "low"      → Warning: result may be inaccurate
 *   < 50%   → "very_low" → Suggest manual inspection
 *
 * @param {Object} result - Raw prediction from ML service
 * @returns {Object} Processed result with confidence metadata
 */
const applyConfidenceThresholds = (result) => {
    const confidence = result.confidence;
    let confidenceLevel, confidenceMessage;

    if (confidence >= PREDICTION.HIGH_CONFIDENCE) {
        confidenceLevel = "high";
        confidenceMessage = "High confidence prediction. The model is very certain about this result.";
    } else if (confidence >= PREDICTION.WARNING_CONFIDENCE) {
        confidenceLevel = "moderate";
        confidenceMessage =
            "Moderate confidence. The prediction is likely correct, " +
            "but consider consulting an agricultural expert for confirmation.";
    } else if (confidence >= PREDICTION.MIN_CONFIDENCE) {
        confidenceLevel = "low";
        confidenceMessage =
            "Low confidence prediction. The image may be unclear or the disease " +
            "may not be well-represented in our training data. Please try with a " +
            "clearer image or consult an expert.";
    } else {
        confidenceLevel = "very_low";
        confidenceMessage =
            "Very low confidence. The model is unable to confidently identify the disease. " +
            "Please provide a clearer, well-lit image of the affected leaf, or consult " +
            "a local agricultural extension officer.";
    }

    return {
        ...result,
        confidenceLevel,
        confidenceMessage,
        isBelowThreshold: confidence < PREDICTION.MIN_CONFIDENCE,
    };
};

// -----------------------------------------------------------
// Error Translation
// -----------------------------------------------------------
/**
 * Convert raw Axios/network errors into user-friendly messages.
 *
 * @param {Error} error - Original error
 * @returns {Error} User-friendly error
 */
const translateMLError = (error) => {
    // Connection refused — ML service is not running
    if (error.code === "ECONNREFUSED") {
        return new Error(
            "The disease detection service is not currently available. " +
            "Please try again later or contact support."
        );
    }

    // Timeout — inference took too long
    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
        return new Error(
            "The disease detection is taking longer than expected. " +
            "This may be due to server load. Please try again in a moment."
        );
    }

    // DNS resolution failure
    if (error.code === "ENOTFOUND") {
        return new Error(
            "Cannot reach the disease detection service. " +
            "Please check your network connection."
        );
    }

    // ML service returned an error response
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 400) {
            return new Error(
                data?.error || "The uploaded image could not be processed. " +
                "Please ensure it's a clear photo of a plant leaf."
            );
        }

        if (status === 413) {
            return new Error("The image file is too large for the ML service to process.");
        }

        if (status === 503) {
            return new Error(
                "The ML model is still loading. Please wait a moment and try again."
            );
        }

        return new Error(
            data?.error || `Disease detection service error (HTTP ${status})`
        );
    }

    // Generic fallback
    return new Error(`Disease detection failed: ${error.message}`);
};

// ============================================================
// HEALTH CHECK
// ============================================================
/**
 * Check if the ML service is running and the model is loaded.
 *
 * EXPECTED RESPONSE:
 *   {
 *     "status": "healthy",
 *     "model_loaded": true,
 *     "model_name": "plant_disease_model.h5",
 *     "classes_count": 15,
 *     "uptime_seconds": 3600
 *   }
 *
 * @returns {Object} Health status of the ML service
 */
const checkHealth = async () => {
    try {
        const response = await mlClient.get("/health", {
            timeout: 1000, // Quick timeout for health checks
        });

        return {
            status: "available",
            ...response.data,
            circuitBreaker: circuitState.isOpen ? "open" : "closed",
        };
    } catch (error) {
        return {
            status: "unavailable",
            error: error.message,
            circuitBreaker: circuitState.isOpen ? "open" : "closed",
            lastFailure: circuitState.lastFailure
                ? new Date(circuitState.lastFailure).toISOString()
                : null,
        };
    }
};

// ============================================================
// GET CIRCUIT BREAKER STATUS (for admin dashboard)
// ============================================================
const getCircuitStatus = () => ({
    isOpen: circuitState.isOpen,
    failures: circuitState.failures,
    lastFailure: circuitState.lastFailure
        ? new Date(circuitState.lastFailure).toISOString()
        : null,
    openedAt: circuitState.openedAt
        ? new Date(circuitState.openedAt).toISOString()
        : null,
    threshold: CIRCUIT_THRESHOLD,
    resetTime: CIRCUIT_RESET_TIME,
});

module.exports = {
    predictDisease,
    checkHealth,
    getCircuitStatus,
    applyConfidenceThresholds,
};
