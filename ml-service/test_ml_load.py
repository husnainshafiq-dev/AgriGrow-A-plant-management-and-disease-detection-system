import os
import time
import logging
import tensorflow as tf

# Suppress TF logs
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("test-load")

# Path to model
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "model", "plant_disease_model_v2_fixed.keras")

# Custom layers (from app.py)
if hasattr(tf, "keras"):
    keras = tf.keras
else:
    import tf_keras as keras

@keras.utils.register_keras_serializable(package="Custom", name="TrueDivide")
class TrueDivide(keras.layers.Layer):
    def call(self, x, y=127.5): return tf.math.truediv(x, y)

@keras.utils.register_keras_serializable(package="Custom", name="Subtract")
class CompatSubtract(keras.layers.Layer):
    def call(self, x, y=1.0): return tf.math.subtract(x, y)

def test_load():
    if not os.path.exists(MODEL_PATH):
        logger.error(f"❌ Model not found at {MODEL_PATH}")
        return

    logger.info(f"🚀 Starting model load test from: {MODEL_PATH}")
    
    start_time = time.time()
    try:
        model = keras.models.load_model(
            MODEL_PATH,
            custom_objects={"TrueDivide": TrueDivide, "Subtract": CompatSubtract},
            compile=False,
            safe_mode=False
        )
        end_time = time.time()
        
        load_duration = round(end_time - start_time, 2)
        logger.info(f"✅ Model loaded successfully in {load_duration}s")
        logger.info(f"   Input shape: {model.input_shape}")
        
    except Exception as e:
        logger.error(f"❌ Failed to load model: {str(e)}")

if __name__ == "__main__":
    test_load()
