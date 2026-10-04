"""Test loading and inference with the active ONNX MobileNetV2 model."""

import os
import sys
import time
import logging
import numpy as np
import onnxruntime as ort

logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
logger = logging.getLogger("test-onnx-load")

MODEL_PATH = os.path.normpath(
    os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        "..",
        "downloads",
        "latest-model",
        "mobilenet_v2_47_classes.onnx",
    )
)

def test_load():
    if not os.path.exists(MODEL_PATH):
        logger.error(f"Model not found at: {MODEL_PATH}")
        sys.exit(1)

    logger.info(f"Loading ONNX model from: {MODEL_PATH}")
    start = time.time()
    try:
        session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        duration = round(time.time() - start, 3)

        input_meta = session.get_inputs()[0]
        output_meta = session.get_outputs()[0]

        logger.info(f"Model loaded successfully in {duration}s")
        logger.info(f"   Input : {input_meta.name} -> {input_meta.shape}")
        logger.info(f"   Output: {output_meta.name} -> {output_meta.shape}")

        # Run test inference with random tensor
        dummy_input = np.random.randn(1, 3, 224, 224).astype(np.float32)
        outputs = session.run([output_meta.name], {input_meta.name: dummy_input})

        logger.info(f"Inference verified: output shape {outputs[0].shape}")
        sys.exit(0)

    except Exception as e:
        logger.error(f"Failed to load/run ONNX model: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_load()
