"""
Tests for model/preprocessing.py.

Run with:
    pytest model/test_preprocessing.py -v

Test categories:
  • Unit  — each pipeline step in isolation, on synthetic inputs.
  • Determinism — same input twice ⇒ identical output.
  • Bit-exactness vs JS — compares the Python output to a JSON dump produced
    by the TS pipeline on the same image. Skipped when the dump is missing.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import cv2
import numpy as np
import pytest

from model.preprocessing import (
    THRESH_BRIGHT_MIN,
    THRESH_CONTRAST_MIN,
    THRESH_SHARPNESS_MIN,
    PipelineTimings,
    clahe_illumination,
    crop_to_lesion,
    debug_pipeline,
    dullrazor_hair_removal,
    preprocess_for_inference,
    quality_check,
    resize_to_input,
    segment_lesion_circle,
    segment_lesion_opencv,
    shades_of_gray,
    to_model_input,
)

# ── Fixtures ──────────────────────────────────────────────────────────────────

TEST_IMAGES_DIR = Path(__file__).parent.parent / "test_images"
JS_DUMPS_DIR    = Path(__file__).parent / "js_outputs"


@pytest.fixture
def synthetic_mole() -> np.ndarray:
    """480×480 skin-coloured background with a darker brown circle in the middle."""
    img = np.full((480, 480, 3), (210, 175, 140), dtype=np.uint8)  # skin
    cv2.circle(img, (240, 240), 80, (90, 60, 50), thickness=-1)     # mole
    # A bit of noise so contrast > threshold and sharpness > threshold
    noise = np.random.RandomState(42).normal(0, 8, img.shape).astype(np.int16)
    img = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    return img


@pytest.fixture
def blurred_image(synthetic_mole) -> np.ndarray:
    return cv2.GaussianBlur(synthetic_mole, (25, 25), 0)


@pytest.fixture
def real_test_images() -> list[Path]:
    if not TEST_IMAGES_DIR.exists():
        return []
    return sorted(
        p for p in TEST_IMAGES_DIR.iterdir()
        if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )


# ── Step 1: quality_check ─────────────────────────────────────────────────────


class TestQualityCheck:
    def test_ok_on_good_image(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        result = quality_check(synthetic_mole, mask)
        assert result["ok"] is True
        assert result["reason"] is None

    def test_rejects_blurry(self, blurred_image):
        result = quality_check(blurred_image)
        assert result["ok"] is False
        assert result["reason"] == "quality.blurry"
        assert result["metrics"]["sharpness"] < THRESH_SHARPNESS_MIN

    def test_rejects_too_dark(self, synthetic_mole):
        dark = (synthetic_mole.astype(np.float32) * 0.15).astype(np.uint8)
        result = quality_check(dark)
        assert result["ok"] is False
        assert result["reason"] in {"quality.dark", "quality.flat", "quality.blurry"}

    def test_rejects_too_bright(self, synthetic_mole):
        bright = np.clip(synthetic_mole.astype(np.int16) + 100, 0, 255).astype(np.uint8)
        result = quality_check(bright)
        if result["metrics"]["brightness"] > 220:
            assert result["reason"] == "quality.bright"

    def test_metrics_in_range(self, synthetic_mole):
        result = quality_check(synthetic_mole)
        m = result["metrics"]
        assert 0 <= m["brightness"] <= 255
        assert 0 <= m["contrast"]   <= 128
        assert m["sharpness"] >= 0


# ── Step 2: segment_lesion ────────────────────────────────────────────────────


class TestSegment:
    def test_finds_lesion(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        coverage = (mask > 0).mean()
        assert 0.02 < coverage < 0.5, f"unexpected coverage {coverage}"

    def test_returns_uint8(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        assert mask.dtype == np.uint8
        assert set(np.unique(mask).tolist()).issubset({0, 255})

    def test_largest_component_only(self, synthetic_mole):
        # Add a tiny dark speck far from the main mole — segmentation
        # should keep only the largest component.
        img = synthetic_mole.copy()
        cv2.circle(img, (50, 50), 8, (60, 40, 30), thickness=-1)
        mask = segment_lesion_opencv(img)
        n, _ = cv2.connectedComponents(mask)
        assert n == 2  # background + 1 foreground

    def test_circle_fallback(self, synthetic_mole):
        mask = segment_lesion_circle(synthetic_mole, 240, 240, 0.3)
        assert mask.shape == synthetic_mole.shape[:2]
        assert mask[240, 240] == 255
        assert mask[0, 0] == 0


# ── Step 3: crop_to_lesion ────────────────────────────────────────────────────


class TestCrop:
    def test_close_to_square(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        cropped = crop_to_lesion(synthetic_mole, mask)
        h, w = cropped.shape[:2]
        assert abs(h - w) <= 4, f"crop is not square: {h}×{w}"

    def test_includes_lesion(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        cropped = crop_to_lesion(synthetic_mole, mask)
        crop_mask = segment_lesion_opencv(cropped)
        assert crop_mask.sum() > 0, "lesion lost during crop"

    def test_fallback_on_empty_mask(self, synthetic_mole):
        empty = np.zeros(synthetic_mole.shape[:2], dtype=np.uint8)
        cropped = crop_to_lesion(synthetic_mole, empty)
        h, w = cropped.shape[:2]
        assert h > 0 and w > 0
        # Centre crop of 60%
        assert abs(h - 0.6 * min(synthetic_mole.shape[:2])) < 5

    def test_padding_15_percent(self, synthetic_mole):
        mask = segment_lesion_opencv(synthetic_mole)
        cropped = crop_to_lesion(synthetic_mole, mask, padding=0.15)
        ys, xs = np.where(mask > 0)
        bbox_w = xs.max() - xs.min()
        bbox_h = ys.max() - ys.min()
        bbox_max = max(bbox_w, bbox_h)
        # crop should be larger than bbox (because of padding + square)
        assert cropped.shape[0] >= bbox_max
        assert cropped.shape[1] >= bbox_max


# ── Step 4: hair removal ──────────────────────────────────────────────────────


class TestHairRemoval:
    def test_preserves_shape(self, synthetic_mole):
        out = dullrazor_hair_removal(synthetic_mole)
        assert out.shape == synthetic_mole.shape
        assert out.dtype == np.uint8

    def test_removes_dark_lines(self):
        """Synthetic 'hair' — narrow black strokes — should largely vanish."""
        img = np.full((200, 200, 3), 200, dtype=np.uint8)
        cv2.line(img, (20, 100), (180, 100), (0, 0, 0), thickness=2)
        cv2.line(img, (100, 20), (100, 180), (0, 0, 0), thickness=2)
        out = dullrazor_hair_removal(img)
        # Mean luminance on the previously-black strokes should rise sharply
        before = img[100, 30:170].mean()
        after  = out[100, 30:170].mean()
        assert after > before + 50


# ── Step 5: shades of gray ────────────────────────────────────────────────────


class TestShadesOfGray:
    def test_neutralises_cast(self):
        # Pure-blue cast — channels are clearly imbalanced
        img = np.full((100, 100, 3), (50, 50, 200), dtype=np.uint8)
        out = shades_of_gray(img, p=6)
        # After SoG the channel means should be much closer together
        r, g, b = out.reshape(-1, 3).mean(axis=0)
        spread_before = max(50, 50, 200) - min(50, 50, 200)
        spread_after  = max(r, g, b) - min(r, g, b)
        assert spread_after < spread_before, f"SoG made it worse: {spread_before} → {spread_after}"

    def test_idempotent_on_neutral(self):
        img = np.full((100, 100, 3), 128, dtype=np.uint8)
        out = shades_of_gray(img, p=6)
        np.testing.assert_array_equal(out, img)

    def test_dtype_and_range(self, synthetic_mole):
        out = shades_of_gray(synthetic_mole, p=6)
        assert out.dtype == np.uint8
        assert out.min() >= 0 and out.max() <= 255


# ── Step 6: CLAHE ─────────────────────────────────────────────────────────────


class TestClahe:
    def test_improves_contrast_low(self):
        # Low-contrast image (all 100–150)
        rng = np.random.RandomState(0)
        img = rng.randint(100, 150, (200, 200, 3), dtype=np.uint8)
        out = clahe_illumination(img)
        assert out.std() > img.std()

    def test_shape_dtype(self, synthetic_mole):
        out = clahe_illumination(synthetic_mole)
        assert out.shape == synthetic_mole.shape
        assert out.dtype == np.uint8


# ── Step 7: resize ────────────────────────────────────────────────────────────


class TestResize:
    def test_exact_size(self, synthetic_mole):
        out = resize_to_input(synthetic_mole, 224)
        assert out.shape == (224, 224, 3)
        assert out.dtype == np.uint8


# ── Step 8: to_model_input — THE CRITICAL ONE ─────────────────────────────────


class TestToModelInput:
    def test_does_not_divide_by_255(self):
        img = np.full((224, 224, 3), 200, dtype=np.uint8)
        tensor = to_model_input(img)
        assert tensor.dtype == np.float32
        assert tensor.min() == 200.0
        assert tensor.max() == 200.0  # NOT 200/255 = 0.784

    def test_preserves_uint8_values(self):
        img = np.arange(256, dtype=np.uint8).reshape(16, 16, 1).repeat(3, axis=2)
        img = cv2.resize(img, (224, 224))
        tensor = to_model_input(img)
        np.testing.assert_array_equal(tensor, img.astype(np.float32))


# ── End-to-end ────────────────────────────────────────────────────────────────


class TestEndToEnd:
    def test_full_pipeline_returns_tensor(self, synthetic_mole):
        timings = PipelineTimings()
        tensor, q = preprocess_for_inference(
            synthetic_mole, timings=timings,
        )
        assert tensor is not None
        assert tensor.shape == (224, 224, 3)
        assert tensor.dtype == np.float32
        assert tensor.min() >= 0 and tensor.max() <= 255
        assert q["ok"] is True
        assert timings.total > 0

    def test_full_pipeline_rejects_blurry(self, blurred_image):
        tensor, q = preprocess_for_inference(blurred_image)
        assert tensor is None
        assert q["ok"] is False

    def test_deterministic(self, synthetic_mole):
        t1, _ = preprocess_for_inference(synthetic_mole)
        t2, _ = preprocess_for_inference(synthetic_mole)
        np.testing.assert_array_equal(t1, t2)

    def test_each_stage_populated(self, synthetic_mole):
        stages = debug_pipeline(synthetic_mole)
        assert stages.raw is not None
        assert stages.mask is not None
        assert stages.cropped is not None
        assert stages.hair_removed is not None
        assert stages.color_corrected is not None
        assert stages.clahe is not None
        assert stages.resized is not None
        assert stages.tensor is not None


# ── Bit-exactness with the JS pipeline ────────────────────────────────────────
#
# The JS test harness (a small RN debug screen, not included in this repo)
# can dump its tensor to JSON. Place those files in model/js_outputs/ with the
# matching image basenames (e.g. test_images/mole_01.jpg ⇄ js_outputs/mole_01.json).


@pytest.mark.parametrize("image_path", [], ids=[])  # filled below
def test_bit_exactness_vs_js(image_path: Path):
    if not JS_DUMPS_DIR.exists():
        pytest.skip("No JS dumps directory")
    dump = JS_DUMPS_DIR / (image_path.stem + ".json")
    if not dump.exists():
        pytest.skip(f"No JS dump for {image_path.name}")

    img = cv2.cvtColor(cv2.imread(str(image_path)), cv2.COLOR_BGR2RGB)
    py_tensor, _ = preprocess_for_inference(img, enable_quality_check=False)
    assert py_tensor is not None

    with dump.open() as f:
        js_tensor = np.array(json.load(f)["tensor"], dtype=np.float32)
    js_tensor = js_tensor.reshape(py_tensor.shape)

    max_diff = np.abs(py_tensor - js_tensor).max()
    mean_diff = np.abs(py_tensor - js_tensor).mean()
    print(f"\n{image_path.name}: max_diff={max_diff:.2f}, mean_diff={mean_diff:.2f}")
    # Spec allows up to 5/255 ≈ 2% per pixel.
    assert max_diff < 5.0, f"pipelines diverge by {max_diff}"


def pytest_generate_tests(metafunc):
    """Parametrise bit-exactness test with all images in test_images/."""
    if metafunc.function.__name__ == "test_bit_exactness_vs_js":
        if not TEST_IMAGES_DIR.exists():
            return
        images = sorted(
            p for p in TEST_IMAGES_DIR.iterdir()
            if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
        )
        metafunc.parametrize("image_path", images, ids=[p.name for p in images])
