"""Live test for the double-normalization concern in app.py."""

import os, sys, time, json, re
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

# Force UTF-8 stdout so non-ASCII layer names don't blow up on Windows
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

import numpy as np
from PIL import Image
import tensorflow as tf

if hasattr(tf, "keras"):
    keras = tf.keras
else:
    import tf_keras as keras

@keras.utils.register_keras_serializable(package="Custom", name="TrueDivide")
class TrueDivide(keras.layers.Layer):
    def call(self, x, y=127.5): return tf.math.truediv(x, y)

@keras.utils.register_keras_serializable(package="Custom", name="Subtract")
class CompatSubtract(keras.layers.Layer):
    def call(self, x, y=1.0):   return tf.math.subtract(x, y)

@keras.utils.register_keras_serializable(package="Custom", name="Dense")
class CustomDense(keras.layers.Dense):
    def __init__(self, **kwargs):
        kwargs.pop("quantization_config", None)
        super().__init__(**kwargs)

_original_dense_init = keras.layers.Dense.__init__
def _patched_dense_init(self, *args, **kwargs):
    kwargs.pop("quantization_config", None)
    _original_dense_init(self, *args, **kwargs)
keras.layers.Dense.__init__ = _patched_dense_init

MODEL_PATH = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "model", "plant_disease_model_v2_fixed.keras",
))
CLASS_NAMES = json.load(open(os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "model", "class_names.json",
))))

def safe_shape(layer):
    try:
        s = layer.output_shape
        return str(s)
    except Exception:
        return "?"

print("=" * 72)
print(f"Loading model: {MODEL_PATH}")
print("=" * 72)
t0 = time.time()
model = keras.models.load_model(
    MODEL_PATH,
    custom_objects={
        "TrueDivide": TrueDivide,
        "Subtract":  CompatSubtract,
        "TFOpLambda": keras.layers.Layer,
        "Dense":     CustomDense,
    },
    safe_mode=False,
    compile=False,
)
print(f"  Loaded in {time.time() - t0:.2f}s")
print(f"  Input  : {model.input_shape}")
print(f"  Output : {model.output_shape}")
print(f"  Layers : {len(model.layers)}")

print()
print("=" * 72)
print("Layer stack -- looking for built-in input preprocessing ops")
print("=" * 72)
# Only flag REAL input-preprocessing layers (Rescaling / Lambda / TFOpLambda /
# TrueDivide). Standard BatchNormalization is a training trick that adapts to
# whatever scale you feed it, so it does NOT count as "the model normalizes
# my input for me".
PREPROC_HINTS = ("rescaling", "lambda", "tfoplambda", "truediv", "truedivide")
hits = []
for i, layer in enumerate(model.layers):
    cls_name = type(layer).__name__.lower()
    cfg_name = (layer.name or "").lower()
    if any(k in cls_name or k in cfg_name for k in PREPROC_HINTS):
        hits.append((i, type(layer).__name__, layer.name, layer))
        print(f"  [!] Layer {i:3d}  cls={type(layer).__name__:20s}  name={layer.name!r}")
if not hits:
    print("  [OK] No built-in input-preprocessing layers (no Rescaling / Lambda / TrueDivide).")
    print("       -> The model expects EXTERNALLY normalized input.")
else:
    print(f"  Found {len(hits)} input-preprocessing layer(s).")
    print("       -> If the model normalizes internally AND app.py normalizes too,")
    print("          you get double normalization and predictions will be wrong.")

print()
print("First 6 layers:")
for layer in model.layers[:6]:
    print(f"  - {type(layer).__name__:20s}  {layer.name}  output={safe_shape(layer)}")
print("Last 6 layers:")
for layer in model.layers[-6:]:
    print(f"  - {type(layer).__name__:20s}  {layer.name}  output={safe_shape(layer)}")

print()
print("=" * 72)
print("Generating synthetic test image (224x224, greenish noisy leaf)")
print("=" * 72)
rng = np.random.default_rng(42)
img = rng.normal(loc=[40, 130, 40], scale=[15, 25, 15], size=(224, 224, 3))
img = np.clip(img, 0, 255).astype(np.uint8)
print(f"  Image stats: min={img.min()}, max={img.max()}, mean={img.mean():.1f}")

img_f32 = img.astype(np.float32)
img_batch = np.expand_dims(img_f32, axis=0)

def predict_and_report(label, x):
    print()
    print("=" * 72)
    print(f"Strategy {label}: input range [{x.min():.2f}, {x.max():.2f}], mean={x.mean():.2f}")
    print("=" * 72)
    t0 = time.time()
    preds = model.predict(x, verbose=0)[0]
    dt = (time.time() - t0) * 1000

    top3_idx = np.argsort(preds)[::-1][:3]
    print(f"  Inference: {dt:.1f} ms")
    print(f"  Top-3 predictions:")
    for j, idx in enumerate(top3_idx, 1):
        name = CLASS_NAMES[idx] if idx < len(CLASS_NAMES) else f"<unknown idx {idx}>"
        print(f"    {j}. {name:45s}  prob={preds[idx]*100:6.2f}%")

    entropy = -np.sum(preds * np.log(preds + 1e-12))
    top1 = float(preds[top3_idx[0]])
    top5 = float(np.sort(preds)[-5:].sum())
    print(f"  Stats: top1={top1*100:.2f}%  top5_sum={top5*100:.2f}%  "
          f"entropy={entropy:.3f}  max_entropy_ln28={np.log(28):.3f}")
    return preds

preds_raw = predict_and_report("A (raw 0-255, NO normalization)", img_batch.copy())

img_norm = (img_batch / 127.5) - 1.0
preds_norm = predict_and_report("B (manual normalize: x/127.5 - 1.0)", img_norm)

print()
print("=" * 72)
print("VERDICT")
print("=" * 72)
e_raw  = -np.sum(preds_raw  * np.log(preds_raw  + 1e-12))
e_norm = -np.sum(preds_norm * np.log(preds_norm + 1e-12))
max_e  = np.log(28)
raw_top1  = float(np.max(preds_raw))
norm_top1 = float(np.max(preds_norm))

print(f"  Strategy A (raw)        top1={raw_top1*100:6.2f}%   entropy={e_raw:.3f}")
print(f"  Strategy B (normalized) top1={norm_top1*100:6.2f}%   entropy={e_norm:.3f}")
print(f"  (Uniform random ~ 3.57% top1, entropy={max_e:.3f})")
print()

if not hits and norm_top1 > raw_top1 * 2 and norm_top1 > 0.20:
    print("  [OK] app.py is CORRECT -- model has NO built-in preprocessing, manual step is needed.")
    print("       (Strategy B is clearly more confident than Strategy A.)")
elif hits and raw_top1 > norm_top1 * 2 and raw_top1 > 0.20:
    print("  [BUG] app.py has a BUG -- model DOES normalize internally, but app.py also normalizes.")
    print("       -> Predictions in production are double-normalized and likely wrong.")
    print("       -> Fix: remove the manual `(img_array / 127.5) - 1.0` step in app.py.")
elif norm_top1 > 0.20 and raw_top1 > 0.20:
    print("  [??] Both look confident. Check that the top-1 class is the SAME for both.")
    name_a = CLASS_NAMES[np.argmax(preds_raw)]
    name_b = CLASS_NAMES[np.argmax(preds_norm)]
    print(f"        A says: {name_a}")
    print(f"        B says: {name_b}")
    if name_a == name_b:
        print("    -> Same prediction under both strategies -- probably OK either way,")
        print("       but the underlying behavior still depends on whether the model")
        print("       normalizes internally (check the layer stack above).")
    else:
        print("    -> DIFFERENT predictions! Definitely a normalization mismatch.")
else:
    print("  [??] Inconclusive -- both strategies gave flat distributions.")
    print("       Could mean: model is broken, fake image is too random, or input format")
    print("       doesn't match training (e.g. model expects BGR, or different size).")
