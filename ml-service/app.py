# ============================================================
# 🧠 ML Service — FastAPI Application (v3 – ONNX Runtime)
# ============================================================
#
# Plant disease detection using a MobileNetV2 model exported
# to ONNX from PyTorch.  Inference runs via ONNX Runtime,
# which is lightweight, fast, and avoids the heavy TensorFlow
# dependency entirely.
#
# ARCHITECTURE:
#
#   ┌──────────────┐   HTTP POST    ┌──────────────────────┐
#   │  Node.js API │  /predict      │  FastAPI ML Service  │
#   │  (Express)   │ ─────────────► │                      │
#   │              │  multipart/    │  1. Receive image    │
#   │              │  form-data     │  2. Preprocess       │
#   │              │                │  3. ONNX predict()   │
#   │              │  ◄──────────── │  4. Return JSON      │
#   └──────────────┘   JSON result  └──────────────────────┘
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
import time
import logging
from io import BytesIO
from typing import Optional

import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import onnxruntime as ort

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
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "downloads",
        "latest-model",
        "mobilenet_v2_47_classes.onnx",
    ),
)
IMG_SIZE = (224, 224)
CONFIDENCE_DECIMAL_PLACES = 2
TOP_K_PREDICTIONS = 5
START_TIME = time.time()

# ImageNet normalisation constants (must match training)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# ============================================================
# CLASS NAMES & METADATA  (47 classes, alphabetical)
# ============================================================
# These MUST match the order of the model's output layer neurons.
# The order comes from PyTorch ImageFolder (alphabetical by
# folder name in the training dataset).
# ============================================================
CLASS_NAMES = [
    "aphid",
    "black_rust",
    "blast",
    "blight",
    "brown_rust",
    "common_root_rot",
    "common_rust",
    "cotton_bacterial_blight",
    "cotton_curl_virus",
    "cotton_fusarium_wilt",
    "cotton_healthy",
    "early_blight",
    "fusarium_head_blight",
    "gray_leaf_spot",
    "healthy",
    "late_blight",
    "leaf_blight",
    "mango_anthracnose",
    "mango_bacterial_canker",
    "mango_cutting_weevil",
    "mango_die_back",
    "mango_gall_midge",
    "mango_healthy",
    "mango_powdery_mildew",
    "mango_sooty_mould",
    "mildew",
    "mite",
    "pepper_bell_bacterial_spot",
    "pepper_bell_healthy",
    "potato_early_blight",
    "potato_healthy",
    "potato_late_blight",
    "septoria",
    "smut",
    "stem_fly",
    "tan_spot",
    "tomato_bacterial_spot",
    "tomato_early_blight",
    "tomato_healthy",
    "tomato_late_blight",
    "tomato_leaf_mold",
    "tomato_mosaic_virus",
    "tomato_septoria_leaf_spot",
    "tomato_spider_mites_two_spotted_spider_mite",
    "tomato_target_spot",
    "tomato_yellow_leaf_curl_virus",
    "yellow_rust",
]

# Human-readable names for API responses
DISPLAY_NAMES = {
    "aphid":                        "Aphid Infestation",
    "black_rust":                   "Black (Stem) Rust",
    "blast":                        "Rice Blast",
    "blight":                       "Blight",
    "brown_rust":                   "Brown (Leaf) Rust",
    "common_root_rot":              "Common Root Rot",
    "common_rust":                  "Common Rust (Corn)",
    "cotton_bacterial_blight":      "Cotton — Bacterial Blight",
    "cotton_curl_virus":            "Cotton — Curl Virus",
    "cotton_fusarium_wilt":         "Cotton — Fusarium Wilt",
    "cotton_healthy":               "Cotton — Healthy",
    "early_blight":                 "Early Blight",
    "fusarium_head_blight":         "Fusarium Head Blight",
    "gray_leaf_spot":               "Gray Leaf Spot (Corn)",
    "healthy":                      "Healthy Plant",
    "late_blight":                  "Late Blight",
    "leaf_blight":                  "Leaf Blight",
    "mango_anthracnose":            "Mango — Anthracnose",
    "mango_bacterial_canker":       "Mango — Bacterial Canker",
    "mango_cutting_weevil":         "Mango — Cutting Weevil",
    "mango_die_back":               "Mango — Die Back",
    "mango_gall_midge":             "Mango — Gall Midge",
    "mango_healthy":                "Mango — Healthy",
    "mango_powdery_mildew":         "Mango — Powdery Mildew",
    "mango_sooty_mould":            "Mango — Sooty Mould",
    "mildew":                       "Powdery / Downy Mildew",
    "mite":                         "Mite Infestation",
    "pepper_bell_bacterial_spot":   "Pepper Bell — Bacterial Spot",
    "pepper_bell_healthy":          "Pepper Bell — Healthy",
    "potato_early_blight":          "Potato — Early Blight",
    "potato_healthy":               "Potato — Healthy",
    "potato_late_blight":           "Potato — Late Blight",
    "septoria":                     "Septoria Leaf Blotch",
    "smut":                         "Smut Disease",
    "stem_fly":                     "Stem Fly Damage",
    "tan_spot":                     "Tan Spot",
    "tomato_bacterial_spot":        "Tomato — Bacterial Spot",
    "tomato_early_blight":          "Tomato — Early Blight",
    "tomato_healthy":               "Tomato — Healthy",
    "tomato_late_blight":           "Tomato — Late Blight",
    "tomato_leaf_mold":             "Tomato — Leaf Mold",
    "tomato_mosaic_virus":          "Tomato — Mosaic Virus",
    "tomato_septoria_leaf_spot":    "Tomato — Septoria Leaf Spot",
    "tomato_spider_mites_two_spotted_spider_mite": "Tomato — Spider Mites",
    "tomato_target_spot":           "Tomato — Target Spot",
    "tomato_yellow_leaf_curl_virus": "Tomato — Yellow Leaf Curl Virus",
    "yellow_rust":                  "Yellow (Stripe) Rust",
}

# Disease information database
DISEASE_INFO = {
    "aphid": {
        "description": "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        "recommendation": "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
        "severity": "moderate",
    },
    "black_rust": {
        "description": "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        "recommendation": "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
        "severity": "high",
    },
    "blast": {
        "description": "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        "recommendation": "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
        "severity": "high",
    },
    "blight": {
        "description": "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        "recommendation": "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
        "severity": "high",
    },
    "brown_rust": {
        "description": "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        "recommendation": "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
        "severity": "moderate",
    },
    "common_root_rot": {
        "description": "Caused by Bipolaris sorokiniana. Causes dark brown discoloration of the sub-crown internode and roots of wheat.",
        "recommendation": "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
        "severity": "moderate",
    },
    "common_rust": {
        "description": "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        "recommendation": "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
        "severity": "moderate",
    },
    "cotton_bacterial_blight": {
        "description": "Caused by Xanthomonas citri pv. malvacearum. Angular, water-soaked spots on leaves that turn brown/black, with black arm symptoms on stems.",
        "recommendation": "Plant resistant varieties. Use acid-delinted certified seed. Apply copper-based sprays. Practice crop rotation and destroy infected crop debris.",
        "severity": "high",
    },
    "cotton_curl_virus": {
        "description": "Cotton leaf curl virus (CLCuV) is transmitted by whitefly (Bemisia tabaci). Causes upward or downward curling, thickening of leaf veins, and stunted growth.",
        "recommendation": "Control whitefly populations with insecticides or sticky traps. Plant CLCuV-resistant varieties. Remove and destroy infected plants early.",
        "severity": "high",
    },
    "cotton_fusarium_wilt": {
        "description": "Caused by Fusarium oxysporum f. sp. vasinfectum. Wilting, yellowing, and browning of leaves, with vascular discoloration visible in cut stems.",
        "recommendation": "Plant resistant varieties. Practice long crop rotations (3+ years). Avoid waterlogged conditions. Use biological controls (Trichoderma).",
        "severity": "high",
    },
    "cotton_healthy": {
        "description": "The cotton plant appears healthy with no visible signs of disease or pest damage.",
        "recommendation": "Continue regular care — proper irrigation, fertilisation, and integrated pest monitoring.",
        "severity": "none",
    },
    "early_blight": {
        "description": 'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
        "severity": "moderate",
    },
    "fusarium_head_blight": {
        "description": "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        "recommendation": "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
        "severity": "high",
    },
    "gray_leaf_spot": {
        "description": "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        "recommendation": "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
        "severity": "moderate",
    },
    "healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular care — proper watering, fertilisation, and pest monitoring.",
        "severity": "none",
    },
    "late_blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
        "severity": "high",
    },
    "leaf_blight": {
        "description": "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        "recommendation": "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
        "severity": "high",
    },
    "mango_anthracnose": {
        "description": "Caused by Colletotrichum gloeosporioides. Black, sunken spots on leaves, flowers and fruit; blossom blight and fruit rot.",
        "recommendation": "Apply copper-based or mancozeb fungicides during flowering. Prune to improve air circulation. Remove fallen debris.",
        "severity": "high",
    },
    "mango_bacterial_canker": {
        "description": "Caused by Xanthomonas citri pv. mangiferaeindicae. Raised, dark lesions oozing bacterial exudate on stems, leaves and fruit.",
        "recommendation": "Prune and destroy infected branches. Apply copper-based bactericides. Avoid overhead irrigation. Use disease-free nursery stock.",
        "severity": "high",
    },
    "mango_cutting_weevil": {
        "description": "Mango cutting weevils (Sternochetus mangiferae) bore into shoots, causing wilting and die-back of young branches.",
        "recommendation": "Collect and destroy fallen fruit containing larvae. Apply insecticides during peak adult activity. Maintain orchard hygiene.",
        "severity": "moderate",
    },
    "mango_die_back": {
        "description": "Caused by Lasiodiplodia theobromae. Drying and darkening of twigs starting from tips, progressing downward with gum exudation.",
        "recommendation": "Prune infected branches 15 cm below visible symptoms. Apply copper oxychloride paste to cut ends. Improve tree vigor.",
        "severity": "high",
    },
    "mango_gall_midge": {
        "description": "Gall midges (Procontarinia spp.) lay eggs in young leaves/flowers, causing abnormal swellings (galls) that distort growth.",
        "recommendation": "Remove and destroy galled plant parts. Apply systemic insecticides early in the season. Maintain orchard sanitation.",
        "severity": "moderate",
    },
    "mango_healthy": {
        "description": "The mango plant appears healthy with no visible signs of disease or pest damage.",
        "recommendation": "Continue regular care — proper irrigation, fertilisation, and integrated pest management.",
        "severity": "none",
    },
    "mango_powdery_mildew": {
        "description": "Caused by Oidium mangiferae. White, powdery fungal growth on flowers, young leaves, and fruit; causes flower/fruit drop.",
        "recommendation": "Apply sulphur-based or systemic fungicides at bud-break. Prune to improve air circulation. Avoid excess nitrogen.",
        "severity": "moderate",
    },
    "mango_sooty_mould": {
        "description": "Black, sooty fungal coating on leaf surfaces, growing on honeydew excreted by sap-sucking insects (hoppers, mealybugs).",
        "recommendation": "Control the underlying insect pest. Wash leaves with mild soapy water. Improve air circulation by pruning.",
        "severity": "moderate",
    },
    "mildew": {
        "description": "Powdery or downy mildew appears as white, flour-like fungal growth on leaves and stems, causing yellowing and premature leaf drop.",
        "recommendation": "Apply sulfur- or copper-based fungicides. Improve air circulation around plants and avoid wetting foliage when watering.",
        "severity": "moderate",
    },
    "mite": {
        "description": "Mites are tiny arachnid pests that pierce plant tissue to suck sap, causing yellow stippling, leaf bronzing, and fine webbing.",
        "recommendation": "Spray with miticides, neem oil, or insecticidal soap. Introduce predatory mites as natural biological controls.",
        "severity": "moderate",
    },
    "pepper_bell_bacterial_spot": {
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
    "pepper_bell_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular watering, fertilisation, and monitoring.",
        "severity": "none",
    },
    "potato_early_blight": {
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
    "potato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Maintain proper watering and nutrient management.",
        "severity": "none",
    },
    "potato_late_blight": {
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
    "septoria": {
        "description": "Septoria leaf blotch causes oval, greyish-brown spots with small black speck-like fruiting bodies (pycnidia) on leaves.",
        "recommendation": "Apply foliar fungicides early. Practice crop rotation and remove infected plant debris to reduce overwintering fungi.",
        "severity": "moderate",
    },
    "smut": {
        "description": "Smut is a fungal disease replacing plant tissue (heads or leaves) with dark, powdery masses of fungal spores.",
        "recommendation": "Use certified disease-free treated seeds. Plant resistant crop varieties and rogue out infected heads before spore release.",
        "severity": "high",
    },
    "stem_fly": {
        "description": "Stem fly larvae bore into plant stems, causing wilting, stem lodging, and drying of central leaves (dead hearts).",
        "recommendation": "Apply systemic insecticides early in the season. Use yellow sticky traps and practice proper field sanitation.",
        "severity": "moderate",
    },
    "tan_spot": {
        "description": "Tan spot (Pyrenophora tritici-repentis) causes small, tan to brown oval spots with dark centres and yellow halos on leaves.",
        "recommendation": "Use resistant cultivars, apply foliar triazole/strobilurin fungicides, and practice stubble management or crop rotation.",
        "severity": "moderate",
    },
    "tomato_bacterial_spot": {
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
    "tomato_early_blight": {
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
    "tomato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
        "severity": "none",
    },
    "tomato_late_blight": {
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
    "tomato_leaf_mold": {
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
    "tomato_mosaic_virus": {
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
    "tomato_septoria_leaf_spot": {
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
    "tomato_spider_mites_two_spotted_spider_mite": {
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
    "tomato_target_spot": {
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
    "tomato_yellow_leaf_curl_virus": {
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
    "yellow_rust": {
        "description": "Yellow (stripe) rust, caused by Puccinia striiformis, forms bright yellow pustules arranged in prominent linear stripes on leaves.",
        "recommendation": "Plant resistant crop varieties. Apply foliar triazole fungicides at first sign of rust stripes.",
        "severity": "high",
    },
}


# -----------------------------------------------------------
# Softmax helper
# -----------------------------------------------------------
def softmax(logits: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    e = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)


# -----------------------------------------------------------
# Load ONNX Model at Startup
# -----------------------------------------------------------
session = None
model_load_error = None
input_name = None
output_name = None


def load_ml_model():
    """Load the ONNX model from disk.

    Called once at startup. The session stays in memory for fast
    inference on subsequent requests.
    """
    global session, model_load_error, input_name, output_name

    if not os.path.exists(MODEL_PATH):
        model_load_error = f"Model file not found at: {MODEL_PATH}"
        logger.error(model_load_error)
        return

    try:
        logger.info(f"🚀 [MODEL LOAD] Starting from: {MODEL_PATH}")
        start = time.time()

        # Create ONNX Runtime inference session
        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        providers = ["CPUExecutionProvider"]
        # Use GPU if available
        if "CUDAExecutionProvider" in ort.get_available_providers():
            providers.insert(0, "CUDAExecutionProvider")

        session = ort.InferenceSession(MODEL_PATH, sess_options, providers=providers)

        input_name = session.get_inputs()[0].name
        output_name = session.get_outputs()[0].name

        elapsed = round(time.time() - start, 2)
        logger.info(f"✅ [MODEL LOAD] Success in {elapsed}s")
        logger.info(f"   Provider: {session.get_providers()}")
        logger.info(f"   Input : {input_name} → {session.get_inputs()[0].shape}")
        logger.info(f"   Output: {output_name} → {session.get_outputs()[0].shape}")

    except Exception as e:
        model_load_error = str(e)
        logger.error(f"❌ [MODEL LOAD] Failed: {e}")
        import traceback

        logger.error(traceback.format_exc())


# ============================================================
# FastAPI Application
# ============================================================
app = FastAPI(
    title="AgriGrow ML Service",
    description="Plant disease detection API using ONNX Runtime (MobileNetV2)",
    version="3.0.0",
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
        4. Convert to numpy array, ImageNet-normalise
        5. Transpose HWC → CHW, add batch dimension
        6. Run ONNX session.run()
        7. Apply softmax to raw logits
        8. Extract top-5 predictions
        9. Look up disease info
       10. Return JSON response
    """
    # Step 1: Check model is loaded
    if session is None:
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
        img_array = np.array(img, dtype=np.float32) / 255.0   # (224, 224, 3)

        # ImageNet normalisation
        img_array = (img_array - IMAGENET_MEAN) / IMAGENET_STD

        # HWC → CHW (PyTorch / ONNX convention)
        img_array = np.transpose(img_array, (2, 0, 1))        # (3, 224, 224)
        img_array = np.expand_dims(img_array, axis=0)          # (1, 3, 224, 224)

        # Step 5: Run inference
        logits = session.run([output_name], {input_name: img_array})[0]  # (1, 47)

        # Step 6: Apply softmax to convert logits → probabilities
        probabilities = softmax(logits[0])

        # Step 7: Extract top prediction
        predicted_idx = int(np.argmax(probabilities))
        confidence = float(probabilities[predicted_idx])
        class_name = CLASS_NAMES[predicted_idx]

        # Step 8: Get top-K predictions
        sorted_indices = np.argsort(probabilities)[::-1][:TOP_K_PREDICTIONS]
        top_predictions = [
            {
                "class": DISPLAY_NAMES.get(CLASS_NAMES[int(i)], CLASS_NAMES[int(i)]),
                "probability": round(float(probabilities[i]) * 100, CONFIDENCE_DECIMAL_PLACES),
            }
            for i in sorted_indices
        ]

        # Step 9: Look up disease info
        is_healthy = "healthy" in class_name.lower()
        info = DISEASE_INFO.get(class_name, {})

        # Step 10: Calculate inference time
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
            "model_name": "mobilenet_v2_47_classes.onnx",
            "classes_count": 47,
            "uptime_seconds": 3600.5,
            "model_error": null
        }
    """
    is_loaded = session is not None
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
            "total": 47,
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
