"""
Persistent model-inference process.
Communicates with Node.js via stdin (image paths) / stdout (JSON results).
The model is loaded ONCE at startup; subsequent predictions are fast.
"""

import sys
import json
import os
import numpy as np

os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"      # suppress TF info/warning logs

from PIL import Image                           # noqa: E402
import tensorflow as tf                         # noqa: E402
from tensorflow.keras.models import load_model  # noqa: E402
from tensorflow.keras.preprocessing.image import img_to_array  # noqa: E402

tf.get_logger().setLevel("ERROR")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "plant_disease_model.h5")
IMG_SIZE = (224, 224)

# NOTE: These class names MUST be in alphabetical order to match how
# Keras image_dataset_from_directory assigns integer labels.
# After retraining on the 28-class dataset, replace plant_disease_model.h5
# with plant_disease_model_v2.h5 and these names will match.
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

DISPLAY_NAMES = {
    "Aphid":                                       "Aphid Infestation",
    "Black Rust":                                  "Black (Stem) Rust — Wheat",
    "Blast":                                       "Rice Blast",
    "Blight":                                      "Blight",
    "Brown Rust":                                  "Brown (Leaf) Rust — Wheat",
    "Common Root Rot":                             "Common Root Rot — Wheat",
    "Common_Rust":                                 "Common Rust — Corn",
    "Early_Blight":                                "Early Blight",
    "Fusarium Head Blight":                        "Fusarium Head Blight — Wheat",
    "Gray_Leaf_Spot":                              "Gray Leaf Spot — Corn",
    "Healthy":                                     "Healthy Plant",
    "Late_Blight":                                 "Late Blight",
    "Leaf Blight":                                 "Leaf Blight",
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

DISEASE_INFO = {
    "Aphid": {
        "description": "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        "recommendation": "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
    },
    "Black Rust": {
        "description": "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        "recommendation": "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
    },
    "Blast": {
        "description": "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        "recommendation": "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
    },
    "Blight": {
        "description": "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        "recommendation": "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
    },
    "Brown Rust": {
        "description": "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        "recommendation": "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
    },
    "Common Root Rot": {
        "description": "Caused by Bipolaris sorokiniana. Dark brown discoloration of the sub-crown internode and roots of wheat.",
        "recommendation": "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
    },
    "Common_Rust": {
        "description": "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        "recommendation": "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
    },
    "Early_Blight": {
        "description": 'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    "Fusarium Head Blight": {
        "description": "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        "recommendation": "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
    },
    "Gray_Leaf_Spot": {
        "description": "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        "recommendation": "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
    },
    "Healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular care — proper watering, fertilisation, and pest monitoring.",
    },
    "Late_Blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    "Leaf Blight": {
        "description": "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        "recommendation": "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
    },
    "Pepper__bell___Bacterial_spot": {
        "description": "Bacterial spot is caused by Xanthomonas bacteria. Small, water-soaked lesions appear on leaves, eventually turning dark brown and necrotic.",
        "recommendation": "Remove and destroy infected plants. Apply copper-based bactericides. Use disease-free seeds and practice crop rotation.",
    },
    "Pepper__bell___healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular watering, fertilisation, and monitoring for early signs of pests or disease.",
    },
    "Potato___Early_blight": {
        "description": 'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    "Potato___Late_blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    "Potato___healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Maintain proper watering and nutrient management. Scout regularly for early disease symptoms.",
    },
    "Tomato_Bacterial_spot": {
        "description": "Caused by Xanthomonas species. Small, dark, raised spots appear on leaves, stems, and fruit.",
        "recommendation": "Use copper sprays preventatively. Avoid working with wet plants. Use certified disease-free transplants.",
    },
    "Tomato_Early_blight": {
        "description": "Caused by Alternaria solani. Concentric ring bull's-eye lesions on lower, older leaves first.",
        "recommendation": "Remove affected leaves. Apply appropriate fungicides. Mulch around plants and avoid overhead watering.",
    },
    "Tomato_Late_blight": {
        "description": "Caused by Phytophthora infestans. Large, dark, water-soaked patches with white mold on the underside.",
        "recommendation": "Apply fungicide promptly. Remove and destroy all infected tissue. Improve air circulation around plants.",
    },
    "Tomato_Leaf_Mold": {
        "description": "Caused by Passalora fulva. Yellow spots on upper leaf surfaces with olive-green to grey mold beneath.",
        "recommendation": "Improve ventilation in greenhouses. Reduce humidity. Apply fungicides and remove infected leaves.",
    },
    "Tomato_Septoria_leaf_spot": {
        "description": "Caused by Septoria lycopersici. Numerous small, circular spots with dark borders and grey centres.",
        "recommendation": "Remove lower infected leaves. Apply fungicides. Practice crop rotation and avoid overhead irrigation.",
    },
    "Tomato_Spider_mites_Two_spotted_spider_mite": {
        "description": "Tiny spider mites feed on leaf cells, causing stippling, yellowing, and fine webbing on undersides.",
        "recommendation": "Spray with miticides or insecticidal soap. Increase humidity. Introduce predatory mites as biological control.",
    },
    "Tomato__Target_Spot": {
        "description": "Caused by Corynespora cassiicola. Brown lesions with concentric rings on leaves, stems, and fruit.",
        "recommendation": "Apply fungicides. Remove infected plant debris. Space plants for good air circulation.",
    },
    "Tomato__Tomato_YellowLeaf__Curl_Virus": {
        "description": "A viral disease transmitted by whiteflies. Leaves curl upward, turn yellow, and plants become stunted.",
        "recommendation": "Control whitefly populations with insecticides or sticky traps. Use virus-resistant varieties. Remove infected plants.",
    },
    "Tomato__Tomato_mosaic_virus": {
        "description": "A highly contagious viral disease causing mottled light/dark green patterns on leaves, sometimes with curling.",
        "recommendation": "Remove and destroy infected plants. Disinfect tools. Use resistant varieties and avoid tobacco products near plants.",
    },
    "Tomato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
    },
}

# ---------------------------------------------------------------------------
# Load model (once)
# ---------------------------------------------------------------------------
# The .h5 was saved with Keras 3 and contains TFOpLambda layers serialised as
# TrueDivide / Subtract with float constant args in inbound_nodes.
# We monkey-patch the functional model reconstruction to wrap float args as
# keyword arguments the layer can accept.

@tf.keras.utils.register_keras_serializable(package="Custom", name="TrueDivide")
class TrueDivide(tf.keras.layers.Layer):
    _allow_non_tensor_positional_args = True
    _convert_input_args = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True
        self._convert_input_args = False

    def call(self, x, y=127.5):
        return tf.math.truediv(x, y)

@tf.keras.utils.register_keras_serializable(package="Custom", name="Subtract")
class CompatSubtract(tf.keras.layers.Layer):
    _allow_non_tensor_positional_args = True
    _convert_input_args = False

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._allow_non_tensor_positional_args = True
        self._convert_input_args = False

    def call(self, x, y=1.0):
        return tf.math.subtract(x, y)

model = load_model(MODEL_PATH, custom_objects={
    "TrueDivide": TrueDivide,
    "Subtract": CompatSubtract,
}, safe_mode=False, compile=False)

# Signal readiness to Node.js
print(json.dumps({"status": "ready"}), flush=True)

# ---------------------------------------------------------------------------
# Main loop — read image paths from stdin, write JSON to stdout
# ---------------------------------------------------------------------------
for line in sys.stdin:
    image_path = line.strip()
    if not image_path:
        continue

    try:
        img = Image.open(image_path).convert("RGB")
        img = img.resize(IMG_SIZE)
        img_array = img_to_array(img)                  # (224,224,3) 0-255
        img_array = np.expand_dims(img_array, axis=0)  # (1,224,224,3)

        predictions = model.predict(img_array, verbose=0)
        predicted_idx = int(np.argmax(predictions[0]))
        confidence = float(predictions[0][predicted_idx])
        class_name = CLASS_NAMES[predicted_idx]

        sorted_indices = np.argsort(predictions[0])[::-1][:5]
        top5 = [
            {
                "class": DISPLAY_NAMES.get(CLASS_NAMES[int(i)], CLASS_NAMES[int(i)]),
                "probability": round(float(predictions[0][i]) * 100, 2),
            }
            for i in sorted_indices
        ]

        is_healthy = "healthy" in class_name.lower()
        info = DISEASE_INFO.get(class_name, {})

        result = {
            "success": True,
            "prediction": DISPLAY_NAMES.get(class_name, class_name),
            "confidence": round(confidence * 100, 2),
            "is_healthy": is_healthy,
            "description": info.get("description", ""),
            "recommendation": info.get("recommendation", ""),
            "top_predictions": top5,
        }
        print(json.dumps(result), flush=True)

    except Exception as exc:
        print(json.dumps({"error": str(exc)}), flush=True)
