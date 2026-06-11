"""
convert_keras_to_tflite.py
==========================
Converts phase_a_best.keras → TFLite for on-device inference in FreeSkinApp.

USAGE
-----
1) Install dependencies (same Python env as your training):
       pip install tensorflow>=2.14.0 numpy

2) Run (from the project root):
       python model/convert_keras_to_tflite.py \
           --input  "C:/Users/Dwibble/Downloads/phase_a_best.keras" \
           --output "assets/model/skin_model.tflite"

3) After conversion, install the TFLite package in the app:
       npx expo install react-native-fast-tflite

4) Rebuild the dev client:
       npx expo prebuild --clean
       npx expo run:android   (or run:ios)

QUANTIZATION
------------
  --quantize default    Dynamic-range quant (float32 → int8 weights, ~4x smaller, minimal accuracy loss)
  --quantize fp16       Float16 quantization (smaller, fast on GPU delegates)
  --quantize none       No quantization (full float32, largest but most accurate)
"""

import argparse
import os
import sys
import numpy as np

def check_tf() -> None:
    try:
        import tensorflow as tf  # noqa: F401
    except ImportError:
        sys.exit("[ERROR] TensorFlow is not installed.\n"
                 "  pip install tensorflow>=2.14.0")


def inspect_model(model) -> dict:
    """Print model summary and return metadata."""
    import tensorflow as tf

    print("\n" + "=" * 60)
    print("  MODEL INSPECTION")
    print("=" * 60)
    model.summary(line_length=60)

    in_shape  = tuple(model.input_shape)
    out_shape = tuple(model.output_shape)
    n_params  = model.count_params()

    print(f"\n  Input  shape : {in_shape}")
    print(f"  Output shape : {out_shape}")
    print(f"  Parameters   : {n_params:,}")

    # Guess output semantics
    out_units = out_shape[-1] if len(out_shape) >= 2 else 1
    if out_units == 7:
        print("\n  Detected: HAM10000 7-class classifier")
        print("  Classes: akiec, bcc, bkl, df, mel, nv, vasc")
        print("  ModelRunner will map probabilities → ABCDE scores")
    elif out_units == 5:
        print("\n  Detected: ABCDE direct regressor (5 outputs)")
        print("  Set MODEL_OUTPUT_TYPE = 'abcde' in ModelRunner.ts")
    elif out_units == 1:
        print("\n  Detected: Binary risk classifier (1 output)")
        print("  Set MODEL_OUTPUT_TYPE = 'binary' in ModelRunner.ts")
    else:
        print(f"\n  Unknown output ({out_units} units). "
              "Update ModelRunner.ts to handle this shape.")

    # Input size for ModelRunner
    if len(in_shape) == 4:          # (batch, H, W, C)
        h, w, c = in_shape[1], in_shape[2], in_shape[3]
        print(f"\n  → Set INPUT_SIZE = {h} in ModelRunner.ts (image size: {h}×{w}×{c})")
    elif len(in_shape) == 3:        # (H, W, C) without batch
        h, w, c = in_shape[0], in_shape[1], in_shape[2]
        print(f"\n  → Set INPUT_SIZE = {h} in ModelRunner.ts (image size: {h}×{w}×{c})")

    return {
        "input_shape":  in_shape,
        "output_shape": out_shape,
        "out_units":    out_units,
    }


def make_representative_dataset(input_shape: tuple, n_samples: int = 100):
    """Generator of random representative samples for full-int quantization."""
    _, h, w, c = input_shape  # (1, H, W, C)

    def generator():
        for _ in range(n_samples):
            # Simulate MobileNet/EfficientNet style normalized input [-1, 1]
            sample = np.random.uniform(-1.0, 1.0, size=(1, h, w, c)).astype(np.float32)
            yield [sample]

    return generator


def convert_to_tflite(
    model,
    output_path: str,
    quantize: str = "default",
) -> None:
    """Convert Keras model → TFLite with the specified quantization."""
    import tensorflow as tf

    print("\n" + "=" * 60)
    print("  CONVERSION")
    print("=" * 60)

    converter = tf.lite.TFLiteConverter.from_keras_model(model)

    if quantize == "default":
        # Dynamic-range quantization: weights → int8, activations stay float
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        print("  Mode: dynamic-range quantization (int8 weights)")

    elif quantize == "fp16":
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.float16]
        print("  Mode: float16 quantization")

    elif quantize == "int8":
        # Full integer quantization with representative dataset
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        in_shape = model.input_shape
        if len(in_shape) == 3:          # add batch dim
            in_shape = (1,) + in_shape
        converter.representative_dataset = make_representative_dataset(in_shape)
        converter.target_spec.supported_ops = [tf.lite.OpsSet.TFLITE_BUILTINS_INT8]
        converter.inference_input_type  = tf.float32  # keep float I/O for app compat
        converter.inference_output_type = tf.float32
        print("  Mode: full int8 quantization")

    else:
        print("  Mode: no quantization (float32)")

    print("  Converting… ", end="", flush=True)
    tflite_bytes = converter.convert()
    print("done")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    with open(output_path, "wb") as f:
        f.write(tflite_bytes)

    size_mb = len(tflite_bytes) / 1_048_576
    print(f"\n  Saved : {os.path.abspath(output_path)}")
    print(f"  Size  : {size_mb:.2f} MB")


def verify_tflite(tflite_path: str) -> None:
    """Run one inference to confirm the model loads and runs."""
    import tensorflow as tf

    print("\n" + "=" * 60)
    print("  VERIFICATION")
    print("=" * 60)

    interp = tf.lite.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()

    in_det  = interp.get_input_details()[0]
    out_det = interp.get_output_details()[0]

    print(f"  Input  name  : {in_det['name']}")
    print(f"  Input  shape : {in_det['shape']}")
    print(f"  Input  dtype : {in_det['dtype']}")
    print(f"  Output name  : {out_det['name']}")
    print(f"  Output shape : {out_det['shape']}")
    print(f"  Output dtype : {out_det['dtype']}")

    # Random test inference
    dummy = np.random.rand(*in_det["shape"]).astype(np.float32)
    interp.set_tensor(in_det["index"], dummy)
    interp.invoke()
    out = interp.get_tensor(out_det["index"])

    print(f"\n  Test output  : {out}")
    if np.any(np.isnan(out)) or np.any(np.isinf(out)):
        print("  [WARNING] Output contains NaN/Inf — check model training!")
    else:
        print("  ✓ Verification passed")


def main() -> None:
    check_tf()

    parser = argparse.ArgumentParser(
        description="Convert phase_a_best.keras → TFLite",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--input", "-i",
        required=True,
        help="Path to the .keras model file",
    )
    parser.add_argument(
        "--output", "-o",
        default="assets/model/skin_model.tflite",
        help="Output path for the .tflite file (default: assets/model/skin_model.tflite)",
    )
    parser.add_argument(
        "--quantize", "-q",
        choices=["default", "fp16", "int8", "none"],
        default="default",
        help="Quantization mode (default: dynamic-range int8 weights)",
    )
    args = parser.parse_args()

    if not os.path.exists(args.input):
        sys.exit(f"[ERROR] Model file not found: {args.input}")

    import tensorflow as tf  # late import after check_tf()

    print(f"\nTensorFlow version : {tf.__version__}")
    print(f"Loading model      : {args.input}")

    model = tf.keras.models.load_model(args.input)

    inspect_model(model)
    convert_to_tflite(model, args.output, quantize=args.quantize)
    verify_tflite(args.output)

    print("\n" + "=" * 60)
    print("  NEXT STEPS")
    print("=" * 60)
    print("  1. The .tflite file is in:  assets/model/skin_model.tflite")
    print("  2. Install TFLite package:  npx expo install react-native-fast-tflite")
    print("  3. Rebuild dev client:      npx expo prebuild --clean")
    print("  4. Run the app:             npx expo run:android")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
