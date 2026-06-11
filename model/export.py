"""
FreeSkin — Export trained PyTorch checkpoint to TFLite
Pipeline: PyTorch → ONNX → TFLite (via onnx2tf)

Usage:
    python export.py --checkpoint checkpoints/best_model.pth --output ../android/app/src/main/assets/skin_model.tflite

Requirements: pip install onnx onnx2tf tensorflow
"""

import argparse
import shutil
import tempfile
from pathlib import Path

import numpy as np
import torch
import timm
import onnx
import onnx2tf
import tensorflow as tf

# Must match train.py
CLASSES   = ["akiec", "bcc", "bkl", "df", "mel", "nv", "vasc"]
IMAGE_SIZE = 224


def load_model(checkpoint_path: Path, device: torch.device) -> torch.nn.Module:
    ckpt = torch.load(checkpoint_path, map_location=device)
    model_name = ckpt.get("model_name", "efficientnet_b0")
    model = timm.create_model(model_name, pretrained=False, num_classes=len(CLASSES))
    model.load_state_dict(ckpt["model_state"])
    model.eval()
    model.to(device)
    print(f"Loaded '{model_name}'  val_acc={ckpt.get('val_acc', '?'):.4f}")
    return model


def export_onnx(model: torch.nn.Module, onnx_path: Path, device: torch.device):
    dummy = torch.randn(1, 3, IMAGE_SIZE, IMAGE_SIZE).to(device)
    torch.onnx.export(
        model,
        dummy,
        str(onnx_path),
        opset_version=17,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )
    onnx.checker.check_model(str(onnx_path))
    print(f"ONNX model saved → {onnx_path}")


def export_tflite(onnx_path: Path, tflite_path: Path):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        saved_model_dir = tmp_path / "saved_model"

        # ONNX → TensorFlow SavedModel
        onnx2tf.convert(
            input_onnx_file_path=str(onnx_path),
            output_folder_path=str(saved_model_dir),
            non_verbose=True,
        )

        # SavedModel → TFLite (float32)
        converter = tf.lite.TFLiteConverter.from_saved_model(str(saved_model_dir))
        converter.optimizations = [tf.lite.Optimize.DEFAULT]          # dynamic-range quant
        converter.target_spec.supported_types = [tf.float32]
        tflite_model = converter.convert()

        tflite_path.parent.mkdir(parents=True, exist_ok=True)
        tflite_path.write_bytes(tflite_model)
        size_mb = tflite_path.stat().st_size / 1024 / 1024
        print(f"TFLite model saved → {tflite_path}  ({size_mb:.1f} MB)")


def verify_tflite(tflite_path: Path):
    """Run a quick sanity-check inference."""
    interpreter = tf.lite.Interpreter(model_path=str(tflite_path))
    interpreter.allocate_tensors()

    inp = interpreter.get_input_details()[0]
    out = interpreter.get_output_details()[0]
    print(f"Input  : shape={inp['shape']} dtype={inp['dtype']}")
    print(f"Output : shape={out['shape']} dtype={out['dtype']}")

    dummy = np.random.rand(1, IMAGE_SIZE, IMAGE_SIZE, 3).astype(np.float32)
    interpreter.set_tensor(inp["index"], dummy)
    interpreter.invoke()
    logits = interpreter.get_tensor(out["index"])
    probs = tf.nn.softmax(logits[0]).numpy()

    print("Softmax probabilities:")
    for cls, p in zip(CLASSES, probs):
        print(f"  {cls:6s}: {p:.4f}")
    print("Verification passed ✓")


def main():
    parser = argparse.ArgumentParser(description="Export FreeSkin model to TFLite")
    parser.add_argument("--checkpoint", default="checkpoints/best_model.pth")
    parser.add_argument(
        "--output",
        default="../android/app/src/main/assets/skin_model.tflite",
    )
    args = parser.parse_args()

    checkpoint_path = Path(args.checkpoint)
    tflite_path     = Path(args.output)

    assert checkpoint_path.exists(), f"Checkpoint not found: {checkpoint_path}"

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")

    model = load_model(checkpoint_path, device)

    with tempfile.TemporaryDirectory() as tmp:
        onnx_path = Path(tmp) / "skin_model.onnx"
        export_onnx(model, onnx_path, device)
        export_tflite(onnx_path, tflite_path)

    verify_tflite(tflite_path)
    print(f"\nDone! Copy {tflite_path} is already in android/app/src/main/assets/")


if __name__ == "__main__":
    main()
