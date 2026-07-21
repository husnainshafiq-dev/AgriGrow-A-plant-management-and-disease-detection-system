# ============================================================
# 🧠 ML Service — FastAPI Application (STEP 3.2)
# ============================================================
#
# This is the Python-based ML microservice that performs
# plant disease detection using a trained TensorFlow/Keras model.
#
# ARCHITECTURE:
#
#   ┌──────────────┐   HTTP POST    ┌──────────────────────┐
#   │  Node.js API │  /predict      │  FastAPI ML Service  │
#   │  (Express)   │ ─────────────► │                      │
#   │              │  multipart/    │  1. Receive image    │
#   │              │  form-data     │  2. Preprocess       │
#   │              │                │  3. model.predict()  │
#   │              │  ◄──────────── │  4. Return JSON      │
#   └──────────────┘   JSON result  └──────────────────────┘
#
# WHY FastAPI OVER Flask?
#   ✅ Async support (non-blocking I/O)
#   ✅ Automatic OpenAPI documentation (/docs)
#   ✅ Built-in request validation (Pydantic)
#   ✅ 3-5x faster than Flask for I/O-bound tasks
#   ✅ Type hints for better IDE support
#
# ENDPOINTS:
#   POST /predict      → Upload image, get disease prediction
#   GET  /health       → Check service status and model info
#   GET  /classes      → List all supported disease classes
#   GET  /docs         → Auto-generated API documentation
#
# HOW TO RUN:
#   cd ml-service
#   pip install -r requirements.txt
#   uvicorn app:app --host 0.0.0.0 --port 8000 --reload
# ============================================================

import os
import sys
import time
import logging
from io import BytesIO
from datetime import datetime
from typing import Optional

import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Suppress TensorFlow verbose logging
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import tensorflow as tf                         # noqa: E402

# TensorFlow 2.16+ may ship Keras separately (tf_keras); support both
if hasattr(tf, "keras"):
    keras = tf.keras
else:
    import tf_keras as keras

load_model = keras.models.load_model
img_to_array = keras.preprocessing.image.img_to_array

try:
    if hasattr(tf, "get_logger"):
        tf.get_logger().setLevel("ERROR")
except Exception:
    pass

# -----------------------------------------------------------
# Logging Configuration
# -----------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ml-service")

# -----------------------------------------------------------
# Configuration
# -----------------------------------------------------------
MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model", "plant_disease_model_v2_fixed.keras"),
)
IMG_SIZE = (224, 224)
CONFIDENCE_DECIMAL_PLACES = 2
TOP_K_PREDICTIONS = 5
START_TIME = time.time()

# ============================================================
# CLASS NAMES & METADATA
# ============================================================
# These MUST match the order of the model's output layer neurons.
# If the order is wrong, predictions will map to incorrect diseases.
# ============================================================
CLASS_NAMES = [
    "Aphid",
    "Black Rust",
    "Blast",
    "Blight",
    "Brown Rust",
    "Common Root Rot",
    "Common_Rust",
    "Early_Blight",
    "Fusarium Head Blight",
    "Gray_Leaf_Spot",
    "Healthy",
    "Late_Blight",
    "Leaf Blight",
    "Pepper__bell___Bacterial_spot",
    "Pepper__bell___healthy",
    "Potato___Early_blight",
    "Potato___Late_blight",
    "Potato___healthy",
    "Tomato_Bacterial_spot",
    "Tomato_Early_blight",
    "Tomato_Late_blight",
    "Tomato_Leaf_Mold",
    "Tomato_Septoria_leaf_spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite",
    "Tomato__Target_Spot",
    "Tomato__Tomato_YellowLeaf__Curl_Virus",
    "Tomato__Tomato_mosaic_virus",
    "Tomato_healthy",
]

# Human-readable names for API responses
DISPLAY_NAMES = {
    "Aphid": "Aphid Infestation",
    "Black Rust": "Black (Stem) Rust",
    "Blast": "Rice Blast",
    "Blight": "Blight",
    "Brown Rust": "Brown (Leaf) Rust",
    "Common Root Rot": "Common Root Rot",
    "Common_Rust": "Common Rust (Corn)",
    "Early_Blight": "Early Blight",
    "Fusarium Head Blight": "Fusarium Head Blight",
    "Gray_Leaf_Spot": "Gray Leaf Spot (Corn)",
    "Healthy": "Healthy Plant",
    "Late_Blight": "Late Blight",
    "Leaf Blight": "Leaf Blight",
    "Pepper__bell___Bacterial_spot":               "Pepper Bell — Bacterial Spot",
    "Pepper__bell___healthy":                      "Pepper Bell — Healthy",
    "Potato___Early_blight":                       "Potato — Early Blight",
    "Potato___Late_blight":                        "Potato — Late Blight",
    "Potato___healthy":                            "Potato — Healthy",
    "Tomato_Bacterial_spot":                       "Tomato — Bacterial Spot",
    "Tomato_Early_blight":                         "Tomato — Early Blight",
    "Tomato_Late_blight":                          "Tomato — Late Blight",
    "Tomato_Leaf_Mold":                            "Tomato — Leaf Mold",
    "Tomato_Septoria_leaf_spot":                   "Tomato — Septoria Leaf Spot",
    "Tomato_Spider_mites_Two_spotted_spider_mite": "Tomato — Spider Mites",
    "Tomato__Target_Spot":                         "Tomato — Target Spot",
    "Tomato__Tomato_YellowLeaf__Curl_Virus":       "Tomato — Yellow Leaf Curl Virus",
    "Tomato__Tomato_mosaic_virus":                 "Tomato — Mosaic Virus",
    "Tomato_healthy":                              "Tomato — Healthy",
}

# Disease information database
DISEASE_INFO = {
    "Aphid": {
        "description": "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        "recommendation": "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
        "severity": "moderate"
    },
    "Black Rust": {
        "description": "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        "recommendation": "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
        "severity": "high"
    },
    "Blast": {
        "description": "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        "recommendation": "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
        "severity": "high"
    },
    "Blight": {
        "description": "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        "recommendation": "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
        "severity": "high"
    },
    "Brown Rust": {
        "description": "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        "recommendation": "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
        "severity": "moderate"
    },
    "Common Root Rot": {
        "description": "Caused by Bipolaris sorokiniana. Causes dark brown discoloration of the sub-crown internode and roots of wheat.",
        "recommendation": "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
        "severity": "moderate"
    },
    "Common_Rust": {
        "description": "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        "recommendation": "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
        "severity": "moderate"
    },
    "Early_Blight": {
        "description": "Caused by Alternaria solani. Dark, concentric \"target-like\" rings appear on older leaves.",
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
        "severity": "moderate"
    },
    "Fusarium Head Blight": {
        "description": "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        "recommendation": "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
        "severity": "high"
    },
    "Gray_Leaf_Spot": {
        "description": "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        "recommendation": "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
        "severity": "moderate"
    },
    "Healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular care — proper watering, fertilisation, and pest monitoring.",
        "severity": "none"
    },
    "Late_Blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
        "severity": "high"
    },
    "Leaf Blight": {
        "description": "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        "recommendation": "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
        "severity": "high"
    },
    "Pepper__bell___Bacterial_spot": {
        "description": (
            "Bacterial spot is caused by Xanthomonas bacteria. Small, water-soaked "
            "lesions appear on leaves, eventually turning dark brown and necrotic."
        ),
        "recommendation": (
            "Remove and destroy infected plants. Apply copper-based bactericides. "
            "Use disease-free seeds and practice crop rotation."
        ),
        "severity": "moderate",
    },
    "Pepper__bell___healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular watering, fertilisation, and monitoring.",
        "severity": "none",
    },
    "Potato___Early_blight": {
        "description": (
            'Caused by Alternaria solani. Dark, concentric "target-like" rings '
            "appear on older leaves."
        ),
        "recommendation": (
            "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. "
            "Rotate crops and use resistant varieties."
        ),
        "severity": "moderate",
    },
    "Potato___Late_blight": {
        "description": (
            "Caused by Phytophthora infestans. Large, irregular, water-soaked "
            "lesions that spread rapidly."
        ),
        "recommendation": (
            "Apply systemic fungicides immediately. Destroy infected plants. "
            "Avoid overhead irrigation and ensure good airflow."
        ),
        "severity": "high",
    },
    "Potato___healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Maintain proper watering and nutrient management.",
        "severity": "none",
    },
    "Tomato_Bacterial_spot": {
        "description": (
            "Caused by Xanthomonas species. Small, dark, raised spots appear "
            "on leaves, stems, and fruit."
        ),
        "recommendation": (
            "Use copper sprays preventatively. Avoid working with wet plants. "
            "Use certified disease-free transplants."
        ),
        "severity": "moderate",
    },
    "Tomato_Early_blight": {
        "description": (
            "Caused by Alternaria solani. Concentric ring bull's-eye lesions "
            "on lower, older leaves first."
        ),
        "recommendation": (
            "Remove affected leaves. Apply appropriate fungicides. "
            "Mulch around plants and avoid overhead watering."
        ),
        "severity": "moderate",
    },
    "Tomato_Late_blight": {
        "description": (
            "Caused by Phytophthora infestans. Large, dark, water-soaked patches "
            "with white mold on the underside."
        ),
        "recommendation": (
            "Apply fungicide promptly. Remove and destroy all infected tissue. "
            "Improve air circulation around plants."
        ),
        "severity": "high",
    },
    "Tomato_Leaf_Mold": {
        "description": (
            "Caused by Passalora fulva. Yellow spots on upper leaf surfaces "
            "with olive-green to grey mold beneath."
        ),
        "recommendation": (
            "Improve ventilation in greenhouses. Reduce humidity. "
            "Apply fungicides and remove infected leaves."
        ),
        "severity": "moderate",
    },
    "Tomato_Septoria_leaf_spot": {
        "description": (
            "Caused by Septoria lycopersici. Numerous small, circular spots "
            "with dark borders and grey centres."
        ),
        "recommendation": (
            "Remove lower infected leaves. Apply fungicides. "
            "Practice crop rotation and avoid overhead irrigation."
        ),
        "severity": "moderate",
    },
    "Tomato_Spider_mites_Two_spotted_spider_mite": {
        "description": (
            "Tiny spider mites feed on leaf cells, causing stippling, "
            "yellowing, and fine webbing on undersides."
        ),
        "recommendation": (
            "Spray with miticides or insecticidal soap. Increase humidity. "
            "Introduce predatory mites as biological control."
        ),
        "severity": "moderate",
    },
    "Tomato__Target_Spot": {
        "description": (
            "Caused by Corynespora cassiicola. Brown lesions with concentric "
            "rings on leaves, stems, and fruit."
        ),
        "recommendation": (
            "Apply fungicides. Remove infected plant debris. "
            "Space plants for good air circulation."
        ),
        "severity": "moderate",
    },
    "Tomato__Tomato_YellowLeaf__Curl_Virus": {
        "description": (
            "A viral disease transmitted by whiteflies. Leaves curl upward, "
            "turn yellow, and plants become stunted."
        ),
        "recommendation": (
            "Control whitefly populations with insecticides or sticky traps. "
            "Use virus-resistant varieties. Remove infected plants."
        ),
        "severity": "high",
    },
    "Tomato__Tomato_mosaic_virus": {
        "description": (
            "A highly contagious viral disease causing mottled light/dark green "
            "patterns on leaves, sometimes with curling."
        ),
        "recommendation": (
            "Remove and destroy infected plants. Disinfect tools. "
            "Use resistant varieties and avoid tobacco products near plants."
        ),
        "severity": "high",
    },
    "Tomato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
        "severity": "none",
    },
}

# ============================================================
# CUSTOM KERAS LAYERS (for model compatibility)
# ============================================================
# The .h5 model was saved with Keras 3 and contains TFOpLambda
# layers (TrueDivide, Subtract) that need custom deserialization.
# ============================================================
@keras.utils.register_keras_serializable(package="Custom", name="TrueDivide")
class TrueDivide(keras.layers.Layer):
    _allow_non_tensor_positional_args = True
    _convert_input_args = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True
        self._convert_input_args = False

    def call(self, x, y=127.5):
        return tf.math.truediv(x, y)


@keras.utils.register_keras_serializable(package="Custom", name="Subtract")
class CompatSubtract(keras.layers.Layer):
    _allow_non_tensor_positional_args = True
    _convert_input_args = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True
        self._convert_input_args = False

    def call(self, x, y=1.0):
        return tf.math.subtract(x, y)


@keras.utils.register_keras_serializable(package="Custom", name="Dense")
class CustomDense(keras.layers.Dense):
    def __init__(self, **kwargs):
        kwargs.pop("quantization_config", None)
        super().__init__(**kwargs)


# -----------------------------------------------------------
# Load Model at Startup
# -----------------------------------------------------------
model = None
model_load_error = None

# Patch Dense to ignore quantization_config since Keras 3 may not support it directly
_original_dense_init = keras.layers.Dense.__init__
def _patched_dense_init(self, *args, **kwargs):
    kwargs.pop("quantization_config", None)
    _original_dense_init(self, *args, **kwargs)
keras.layers.Dense.__init__ = _patched_dense_init

def load_ml_model():
    """Load the Keras model from disk.
    
    Called once at startup. The model stays in memory for fast
    inference on subsequent requests.
    """
    global model, model_load_error

    if not os.path.exists(MODEL_PATH):
        model_load_error = f"Model file not found at: {MODEL_PATH}"
        logger.error(model_load_error)
        return

    try:
        logger.info(f"🚀 [MODEL LOAD] Starting from: {MODEL_PATH}")
        start = time.time()

        # Check if we are using Keras 3 or tf-keras
        is_tf_keras = "tf_keras" in sys.modules
        logger.info(f"   Using {'tf-keras (legacy)' if is_tf_keras else 'native tf.keras'}")

        model = load_model(
            MODEL_PATH,
            custom_objects={
                "TrueDivide": TrueDivide,
                "Subtract": CompatSubtract,
                # Add aliases in case the model used a different name
                "TFOpLambda": keras.layers.Layer, 
                "Dense": CustomDense,
            },
            safe_mode=False,
            compile=False,
        )

        elapsed = round(time.time() - start, 2)
        logger.info(f"✅ [MODEL LOAD] Success in {elapsed}s")
        logger.info(f"   Input : {model.input_shape}")
        logger.info(f"   Output: {model.output_shape}")
        logger.info(f"   Nodes : {len(model.layers)} layers")

    except Exception as e:
        model_load_error = str(e)
        logger.error(f"❌ [MODEL LOAD] Failed: {e}")
        # Log the traceback for deeper debugging
        import traceback
        logger.error(traceback.format_exc())


# ============================================================
# FastAPI Application
# ============================================================
app = FastAPI(
    title="AgriGrow ML Service",
    description="Plant disease detection API using TensorFlow/Keras",
    version="1.0.0",
    docs_url="/docs",
)

# CORS — allow all origins (the Node.js API is the only client)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load model when FastAPI starts
@app.on_event("startup")
async def startup_event():
    load_ml_model()


# ============================================================
# Response Models (Pydantic)
# ============================================================
class PredictionItem(BaseModel):
    """Single prediction entry in the top-K list."""
    class_name: str  # Using class_name instead of 'class' (reserved word)
    probability: float


class PredictionResponse(BaseModel):
    """Full prediction response."""
    success: bool
    prediction: str
    confidence: float
    is_healthy: bool
    description: str
    recommendation: str
    severity: str
    top_predictions: list
    inference_time_ms: float


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    model_loaded: bool
    model_name: str
    classes_count: int
    uptime_seconds: float
    model_error: Optional[str]


# ============================================================
# PREDICT ENDPOINT
# ============================================================
@app.post("/predict", response_model=PredictionResponse)
async def predict(file: UploadFile = File(...)):
    """
    Receive a plant leaf image and return disease prediction.

    REQUEST:
        POST /predict
        Content-Type: multipart/form-data
        Body: file=<image binary>

    RESPONSE (example):
        {
            "success": true,
            "prediction": "Tomato — Early Blight",
            "confidence": 94.32,
            "is_healthy": false,
            "description": "Caused by Alternaria solani...",
            "recommendation": "Apply fungicides...",
            "severity": "moderate",
            "top_predictions": [
                {"class": "Tomato — Early Blight", "probability": 94.32},
                {"class": "Tomato — Late Blight",  "probability": 3.21},
                ...
            ],
            "inference_time_ms": 245.5
        }

    PROCESSING STEPS:
        1. Validate file is an image
        2. Read into memory (no disk I/O)
        3. Resize to 224×224 pixels
        4. Convert to numpy array (224, 224, 3)
        5. Add batch dimension (1, 224, 224, 3)
        6. Run model.predict()
        7. Extract top-5 predictions
        8. Look up disease info
        9. Return JSON response
    """
    # Step 1: Check model is loaded
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=f"ML model is not loaded. Error: {model_load_error or 'Unknown'}",
        )

    # Step 2: Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {content_type}. Please upload an image (JPEG/PNG).",
        )

    try:
        # Step 3: Read image into memory
        start_time = time.time()
        contents = await file.read()

        if len(contents) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        if len(contents) > 10 * 1024 * 1024:  # 10 MB limit
            raise HTTPException(
                status_code=413,
                detail="File too large. Maximum size is 10 MB.",
            )

        # Step 4: Open image and preprocess
        img = Image.open(BytesIO(contents)).convert("RGB")
        img = img.resize(IMG_SIZE)
        img_array = img_to_array(img)                   # (224, 224, 3) float32
        img_array = np.expand_dims(img_array, axis=0)   # (1, 224, 224, 3)
        
        # Apply preprocessing normally handled by the model's lambda layer
        img_array = (img_array / 127.5) - 1.0

        # Step 5: Run inference
        predictions = model.predict(img_array, verbose=0)

        # Step 6: Extract top prediction
        predicted_idx = int(np.argmax(predictions[0]))
        confidence = float(predictions[0][predicted_idx])
        class_name = CLASS_NAMES[predicted_idx]

        # Step 7: Get top-K predictions
        sorted_indices = np.argsort(predictions[0])[::-1][:TOP_K_PREDICTIONS]
        top_predictions = [
            {
                "class": DISPLAY_NAMES.get(CLASS_NAMES[int(i)], CLASS_NAMES[int(i)]),
                "probability": round(float(predictions[0][i]) * 100, CONFIDENCE_DECIMAL_PLACES),
            }
            for i in sorted_indices
        ]

        # Step 8: Look up disease info
        is_healthy = "healthy" in class_name.lower()
        info = DISEASE_INFO.get(class_name, {})

        # Step 9: Calculate inference time
        inference_time = round((time.time() - start_time) * 1000, 1)

        logger.info(
            f"Prediction: {DISPLAY_NAMES.get(class_name, class_name)} "
            f"({round(confidence * 100, 2)}%) — {inference_time}ms"
        )

        return {
            "success": True,
            "prediction": DISPLAY_NAMES.get(class_name, class_name),
            "confidence": round(confidence * 100, CONFIDENCE_DECIMAL_PLACES),
            "is_healthy": is_healthy,
            "description": info.get("description", ""),
            "recommendation": info.get("recommendation", ""),
            "severity": info.get("severity", "unknown"),
            "top_predictions": top_predictions,
            "inference_time_ms": inference_time,
        }

    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        logger.error(f"Prediction failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}",
        )


# ============================================================
# HEALTH CHECK ENDPOINT
# ============================================================
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Check if the ML service is running and the model is loaded.

    Returns:
        {
            "status": "healthy",
            "model_loaded": true,
            "model_name": "plant_disease_model.h5",
            "classes_count": 15,
            "uptime_seconds": 3600.5,
            "model_error": null
        }
    """
    is_loaded = model is not None
    uptime = round(time.time() - START_TIME, 1)

    return {
        "status": "healthy" if is_loaded else "unhealthy",
        "model_loaded": is_loaded,
        "model_name": os.path.basename(MODEL_PATH),
        "classes_count": len(CLASS_NAMES),
        "uptime_seconds": uptime,
        "model_error": model_load_error if not is_loaded else None,
    }


# ============================================================
# LIST SUPPORTED CLASSES
# ============================================================
@app.get("/classes")
async def list_classes():
    """
    List all disease classes the model can detect.

    Returns:
        {
            "total": 15,
            "classes": [
                {"id": 0, "internal_name": "...", "display_name": "...", "is_healthy": false},
                ...
            ]
        }
    """
    classes = [
        {
            "id": i,
            "internal_name": name,
            "display_name": DISPLAY_NAMES.get(name, name),
            "is_healthy": "healthy" in name.lower(),
            "severity": DISEASE_INFO.get(name, {}).get("severity", "unknown"),
        }
        for i, name in enumerate(CLASS_NAMES)
    ]

    return {
        "total": len(classes),
        "classes": classes,
    }


# ============================================================
# Main entry point (for running without uvicorn CLI)
# ============================================================
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("ML_PORT", 8000))
    logger.info(f"Starting ML service on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port)
