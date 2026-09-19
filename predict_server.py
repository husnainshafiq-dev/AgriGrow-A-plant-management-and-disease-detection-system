"""
Persistent model-inference process (ONNX Runtime).
Communicates with Node.js via stdin (image paths) / stdout (JSON results).
The model is loaded ONCE at startup; subsequent predictions are fast.
"""

import sys
import json
import os
import numpy as np

from PIL import Image                           # noqa: E402
import onnxruntime as ort                       # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "downloads",
    "latest-model",
    "mobilenet_v2_47_classes.onnx",
)
IMG_SIZE = (224, 224)

# ImageNet normalisation constants (must match training)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

# NOTE: These class names MUST be in the exact order produced by
# PyTorch ImageFolder (alphabetical by folder name in the dataset).
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

DISPLAY_NAMES = {
    "aphid":                        "Aphid Infestation",
    "black_rust":                   "Black (Stem) Rust — Wheat",
    "blast":                        "Rice Blast",
    "blight":                       "Blight",
    "brown_rust":                   "Brown (Leaf) Rust — Wheat",
    "common_root_rot":              "Common Root Rot — Wheat",
    "common_rust":                  "Common Rust — Corn",
    "cotton_bacterial_blight":      "Cotton — Bacterial Blight",
    "cotton_curl_virus":            "Cotton — Curl Virus",
    "cotton_fusarium_wilt":         "Cotton — Fusarium Wilt",
    "cotton_healthy":               "Cotton — Healthy",
    "early_blight":                 "Early Blight",
    "fusarium_head_blight":         "Fusarium Head Blight — Wheat",
    "gray_leaf_spot":               "Gray Leaf Spot — Corn",
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

DISEASE_INFO = {
    "aphid": {
        "description": "Aphids are small sap-sucking insects that colonise leaves and stems, causing yellowing, curling, and stunted growth.",
        "recommendation": "Spray with neem oil or insecticidal soap. Introduce ladybugs as biological control. Remove heavily infested parts.",
    },
    "black_rust": {
        "description": "Black (stem) rust is caused by Puccinia graminis. Dark reddish-brown to black pustules appear on stems and leaves of wheat.",
        "recommendation": "Plant resistant varieties. Apply fungicides (propiconazole or tebuconazole) at first sign. Remove volunteer wheat plants.",
    },
    "blast": {
        "description": "Rice blast is caused by Magnaporthe oryzae. Diamond-shaped lesions with grey centres and dark borders appear on leaves.",
        "recommendation": "Use blast-resistant rice varieties. Apply fungicides (tricyclazole). Avoid excess nitrogen fertilisation.",
    },
    "blight": {
        "description": "Blight causes rapid browning and death of plant tissues, typically affecting leaves, stems, and flowers.",
        "recommendation": "Remove infected plants promptly. Apply appropriate fungicides. Ensure good air circulation and avoid overhead watering.",
    },
    "brown_rust": {
        "description": "Brown (leaf) rust is caused by Puccinia triticina. Orange-brown pustules scattered on the upper surface of wheat leaves.",
        "recommendation": "Use resistant cultivars. Apply foliar fungicides at early onset. Monitor fields regularly during heading stage.",
    },
    "common_root_rot": {
        "description": "Caused by Bipolaris sorokiniana. Dark brown discoloration of the sub-crown internode and roots of wheat.",
        "recommendation": "Rotate crops with non-cereal crops. Use seed treatments. Avoid deep sowing and maintain good soil drainage.",
    },
    "common_rust": {
        "description": "Common rust of corn is caused by Puccinia sorghi. Small, circular to elongate, cinnamon-brown pustules on both leaf surfaces.",
        "recommendation": "Plant resistant hybrids. Apply fungicides if infection occurs before tasselling. Most hybrids have adequate resistance.",
    },
    "cotton_bacterial_blight": {
        "description": "Caused by Xanthomonas citri pv. malvacearum. Angular, water-soaked spots on leaves that turn brown/black.",
        "recommendation": "Plant resistant varieties. Use acid-delinted certified seed. Apply copper-based sprays. Practice crop rotation.",
    },
    "cotton_curl_virus": {
        "description": "Cotton leaf curl virus (CLCuV) is transmitted by whitefly. Causes upward or downward curling, thickening of leaf veins, and stunted growth.",
        "recommendation": "Control whitefly populations with insecticides or sticky traps. Plant CLCuV-resistant varieties. Remove infected plants early.",
    },
    "cotton_fusarium_wilt": {
        "description": "Caused by Fusarium oxysporum f. sp. vasinfectum. Wilting, yellowing, and browning of leaves, with vascular discoloration.",
        "recommendation": "Plant resistant varieties. Practice long crop rotations (3+ years). Avoid waterlogged conditions. Use biological controls (Trichoderma).",
    },
    "cotton_healthy": {
        "description": "The cotton plant appears healthy with no visible signs of disease or pest damage.",
        "recommendation": "Continue regular care — proper irrigation, fertilisation, and integrated pest monitoring.",
    },
    "early_blight": {
        "description": 'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    "fusarium_head_blight": {
        "description": "Caused by Fusarium graminearum. Bleached spikelets and pinkish mold on wheat heads. Produces mycotoxins in grain.",
        "recommendation": "Plant moderately resistant varieties. Apply fungicides at flowering. Rotate with non-host crops. Test grain for mycotoxins.",
    },
    "gray_leaf_spot": {
        "description": "Caused by Cercospora zeae-maydis. Rectangular, grey-tan lesions run parallel to corn leaf veins.",
        "recommendation": "Use resistant hybrids. Rotate crops. Tillage of corn residue reduces inoculum. Fungicides can help in severe cases.",
    },
    "healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular care — proper watering, fertilisation, and pest monitoring.",
    },
    "late_blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    "leaf_blight": {
        "description": "Leaf blight causes large, elongated, brownish lesions on leaves, often starting from leaf tips.",
        "recommendation": "Remove and destroy infected leaves. Apply foliar fungicides. Practice crop rotation and balanced fertilisation.",
    },
    "mango_anthracnose": {
        "description": "Caused by Colletotrichum gloeosporioides. Black, sunken spots on leaves, flowers and fruit.",
        "recommendation": "Apply copper-based or mancozeb fungicides during flowering. Prune to improve air circulation. Remove fallen debris.",
    },
    "mango_bacterial_canker": {
        "description": "Caused by Xanthomonas citri pv. mangiferaeindicae. Raised, dark lesions oozing bacterial exudate on stems and leaves.",
        "recommendation": "Prune and destroy infected branches. Apply copper-based bactericides. Avoid overhead irrigation.",
    },
    "mango_cutting_weevil": {
        "description": "Mango cutting weevils bore into shoots, causing wilting and die-back of young branches.",
        "recommendation": "Collect and destroy fallen fruit containing larvae. Apply insecticides during peak adult activity.",
    },
    "mango_die_back": {
        "description": "Caused by Lasiodiplodia theobromae. Drying and darkening of twigs starting from tips, progressing downward.",
        "recommendation": "Prune infected branches 15 cm below visible symptoms. Apply copper oxychloride paste to cut ends.",
    },
    "mango_gall_midge": {
        "description": "Gall midges lay eggs in young leaves/flowers, causing abnormal swellings (galls) that distort growth.",
        "recommendation": "Remove and destroy galled plant parts. Apply systemic insecticides early in the season.",
    },
    "mango_healthy": {
        "description": "The mango plant appears healthy with no visible signs of disease or pest damage.",
        "recommendation": "Continue regular care — proper irrigation, fertilisation, and integrated pest management.",
    },
    "mango_powdery_mildew": {
        "description": "Caused by Oidium mangiferae. White, powdery fungal growth on flowers, young leaves, and fruit.",
        "recommendation": "Apply sulphur-based or systemic fungicides at bud-break. Prune to improve air circulation.",
    },
    "mango_sooty_mould": {
        "description": "Black, sooty fungal coating on leaf surfaces, growing on honeydew excreted by sap-sucking insects.",
        "recommendation": "Control the underlying insect pest. Wash leaves with mild soapy water. Improve air circulation.",
    },
    "mildew": {
        "description": "Powdery or downy mildew appears as white, flour-like fungal growth on leaves and stems.",
        "recommendation": "Apply sulfur- or copper-based fungicides. Improve air circulation and avoid wetting foliage.",
    },
    "mite": {
        "description": "Mites are tiny arachnid pests that pierce plant tissue to suck sap, causing yellow stippling and fine webbing.",
        "recommendation": "Spray with miticides, neem oil, or insecticidal soap. Introduce predatory mites as biological controls.",
    },
    "pepper_bell_bacterial_spot": {
        "description": "Bacterial spot is caused by Xanthomonas bacteria. Small, water-soaked lesions appear on leaves.",
        "recommendation": "Remove and destroy infected plants. Apply copper-based bactericides. Use disease-free seeds.",
    },
    "pepper_bell_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Continue regular watering, fertilisation, and monitoring for early signs of pests or disease.",
    },
    "potato_early_blight": {
        "description": 'Caused by Alternaria solani. Dark, concentric "target-like" rings appear on older leaves.',
        "recommendation": "Apply fungicides (chlorothalonil or mancozeb). Remove infected foliage. Rotate crops and use resistant varieties.",
    },
    "potato_late_blight": {
        "description": "Caused by Phytophthora infestans. Large, irregular, water-soaked lesions that spread rapidly.",
        "recommendation": "Apply systemic fungicides immediately. Destroy infected plants. Avoid overhead irrigation and ensure good airflow.",
    },
    "potato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Maintain proper watering and nutrient management. Scout regularly for early disease symptoms.",
    },
    "tomato_bacterial_spot": {
        "description": "Caused by Xanthomonas species. Small, dark, raised spots appear on leaves, stems, and fruit.",
        "recommendation": "Use copper sprays preventatively. Avoid working with wet plants. Use certified disease-free transplants.",
    },
    "tomato_early_blight": {
        "description": "Caused by Alternaria solani. Concentric ring bull's-eye lesions on lower, older leaves first.",
        "recommendation": "Remove affected leaves. Apply appropriate fungicides. Mulch around plants and avoid overhead watering.",
    },
    "tomato_late_blight": {
        "description": "Caused by Phytophthora infestans. Large, dark, water-soaked patches with white mold on the underside.",
        "recommendation": "Apply fungicide promptly. Remove and destroy all infected tissue. Improve air circulation around plants.",
    },
    "tomato_leaf_mold": {
        "description": "Caused by Passalora fulva. Yellow spots on upper leaf surfaces with olive-green to grey mold beneath.",
        "recommendation": "Improve ventilation in greenhouses. Reduce humidity. Apply fungicides and remove infected leaves.",
    },
    "tomato_septoria_leaf_spot": {
        "description": "Caused by Septoria lycopersici. Numerous small, circular spots with dark borders and grey centres.",
        "recommendation": "Remove lower infected leaves. Apply fungicides. Practice crop rotation and avoid overhead irrigation.",
    },
    "tomato_spider_mites_two_spotted_spider_mite": {
        "description": "Tiny spider mites feed on leaf cells, causing stippling, yellowing, and fine webbing on undersides.",
        "recommendation": "Spray with miticides or insecticidal soap. Increase humidity. Introduce predatory mites as biological control.",
    },
    "tomato_target_spot": {
        "description": "Caused by Corynespora cassiicola. Brown lesions with concentric rings on leaves, stems, and fruit.",
        "recommendation": "Apply fungicides. Remove infected plant debris. Space plants for good air circulation.",
    },
    "tomato_yellow_leaf_curl_virus": {
        "description": "A viral disease transmitted by whiteflies. Leaves curl upward, turn yellow, and plants become stunted.",
        "recommendation": "Control whitefly populations with insecticides or sticky traps. Use virus-resistant varieties. Remove infected plants.",
    },
    "tomato_mosaic_virus": {
        "description": "A highly contagious viral disease causing mottled light/dark green patterns on leaves, sometimes with curling.",
        "recommendation": "Remove and destroy infected plants. Disinfect tools. Use resistant varieties and avoid tobacco products near plants.",
    },
    "tomato_healthy": {
        "description": "The plant appears healthy with no visible signs of disease.",
        "recommendation": "Keep up regular care — proper watering, fertilisation, and pest monitoring.",
    },
    "septoria": {
        "description": "Septoria leaf blotch causes oval, greyish-brown spots with small black speck-like fruiting bodies on leaves.",
        "recommendation": "Apply foliar fungicides early. Practice crop rotation and remove infected plant debris.",
    },
    "smut": {
        "description": "Smut is a fungal disease replacing plant tissue with dark, powdery masses of fungal spores.",
        "recommendation": "Use certified disease-free treated seeds. Plant resistant crop varieties.",
    },
    "stem_fly": {
        "description": "Stem fly larvae bore into plant stems, causing wilting, stem lodging, and drying of central leaves.",
        "recommendation": "Apply systemic insecticides early in the season. Use yellow sticky traps and practice proper field sanitation.",
    },
    "tan_spot": {
        "description": "Tan spot causes small, tan to brown oval spots with dark centres and yellow halos on leaves.",
        "recommendation": "Use resistant cultivars, apply foliar triazole/strobilurin fungicides, and practice stubble management.",
    },
    "yellow_rust": {
        "description": "Yellow (stripe) rust forms bright yellow pustules arranged in prominent linear stripes on leaves.",
        "recommendation": "Plant resistant crop varieties. Apply foliar triazole fungicides at first sign of rust stripes.",
    },
}


# ---------------------------------------------------------------------------
# Softmax
# ---------------------------------------------------------------------------
def softmax(logits):
    """Numerically stable softmax."""
    e = np.exp(logits - np.max(logits))
    return e / e.sum()


# ---------------------------------------------------------------------------
# Load model (once)
# ---------------------------------------------------------------------------
session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
input_name = session.get_inputs()[0].name
output_name = session.get_outputs()[0].name

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
        img_array = np.array(img, dtype=np.float32) / 255.0  # (224,224,3)

        # ImageNet normalisation
        img_array = (img_array - IMAGENET_MEAN) / IMAGENET_STD

        # HWC → CHW, add batch dimension
        img_array = np.transpose(img_array, (2, 0, 1))      # (3,224,224)
        img_array = np.expand_dims(img_array, axis=0)        # (1,3,224,224)

        logits = session.run([output_name], {input_name: img_array})[0]
        probabilities = softmax(logits[0])

        predicted_idx = int(np.argmax(probabilities))
        confidence = float(probabilities[predicted_idx])
        class_name = CLASS_NAMES[predicted_idx]

        sorted_indices = np.argsort(probabilities)[::-1][:5]
        top5 = [
            {
                "class": DISPLAY_NAMES.get(CLASS_NAMES[int(i)], CLASS_NAMES[int(i)]),
                "probability": round(float(probabilities[i]) * 100, 2),
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
