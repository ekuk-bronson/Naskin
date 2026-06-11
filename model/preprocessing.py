"""
DermaMap preprocessing pipeline — Python reference implementation.

8-step pipeline that transforms an arbitrary smartphone photo into a tensor
ready for the HAM10000-trained classifier (EfficientNetV2-B0).

Pipeline:
  1. quality_check        — sharpness/brightness/contrast/coverage gates
  2. segment_lesion       — binary mask (OpenCV Otsu + morphology fallback)
  3. crop_to_lesion       — square crop to bbox + 15% padding
  4. dullrazor_hair       — BlackHat morphology + INPAINT_TELEA
  5. shades_of_gray       — Minkowski p=6 color constancy
  6. clahe_illumination   — CLAHE on L channel of LAB
  7. resize_to_input      — bilinear resize to 224×224
  8. to_model_input       — uint8 -> float32 in [0, 255]  (NO /255)

All intermediate images are uint8 RGB [H, W, 3]. Float only at step 8.

CRITICAL contract with the model:
  - Inputs are RGB, NOT BGR.
  - Inputs are in [0, 255] float32 — DO NOT divide by 255.
  - The model has built-in normalisation; ImageNet mean/std is not applied here.

Usage:
    from model.preprocessing import preprocess_for_inference
    img = cv2.cvtColor(cv2.imread("test.jpg"), cv2.COLOR_BGR2RGB)
    tensor, quality = preprocess_for_inference(img)
    if tensor is None:
        print("rejected:", quality["reason"])
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Optional, TypedDict

import cv2
import numpy as np


# ─── Public types ──────────────────────────────────────────────────────────────


class QualityMetrics(TypedDict):
    sharpness: float        # Laplacian variance — higher = sharper
    brightness: float       # 0–255 mean grey
    contrast: float         # 0–~100 std grey
    lesion_coverage: float  # 0–1 fraction of frame occupied by mask


class QualityResult(TypedDict):
    ok: bool
    reason: Optional[str]   # i18n key, e.g. "quality.blurry"
    metrics: QualityMetrics


@dataclass
class PipelineTimings:
    """Wall-clock ms for each step, useful for production debugging."""
    quality_check: float = 0.0
    segment_lesion: float = 0.0
    crop_to_lesion: float = 0.0
    hair_removal: float = 0.0
    color_constancy: float = 0.0
    clahe: float = 0.0
    resize: float = 0.0
    to_float: float = 0.0
    total: float = 0.0


# ─── Quality-check thresholds ──────────────────────────────────────────────────

THRESH_SHARPNESS_MIN = 100.0    # Laplacian variance
THRESH_BRIGHT_MIN    = 50.0
THRESH_BRIGHT_MAX    = 220.0
THRESH_CONTRAST_MIN  = 25.0
THRESH_COVERAGE_MIN  = 0.05
THRESH_COVERAGE_MAX  = 0.85


# ─── Step 1: Quality Check ─────────────────────────────────────────────────────


def quality_check(img: np.ndarray, mask: Optional[np.ndarray] = None) -> QualityResult:
    """
    Inspect the raw photo for common smartphone failure modes.

    Parameters
    ----------
    img  : RGB uint8 [H, W, 3]
    mask : optional binary uint8 {0, 255} [H, W] from segment_lesion.
           If None, lesion_coverage is reported as 0 and not gated.

    Returns
    -------
    QualityResult — never raises, callers decide whether to gate on ok.
    """
    assert img.dtype == np.uint8 and img.ndim == 3 and img.shape[2] == 3, \
        "quality_check expects RGB uint8 [H, W, 3]"

    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)

    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())
    contrast = float(gray.std())
    coverage = float(mask.sum() / 255 / mask.size) if mask is not None else 0.0

    metrics: QualityMetrics = {
        "sharpness":       sharpness,
        "brightness":      brightness,
        "contrast":        contrast,
        "lesion_coverage": coverage,
    }

    # Ordering matters — return the most actionable feedback first.
    if sharpness < THRESH_SHARPNESS_MIN:
        return {"ok": False, "reason": "quality.blurry", "metrics": metrics}
    if brightness < THRESH_BRIGHT_MIN:
        return {"ok": False, "reason": "quality.dark", "metrics": metrics}
    if brightness > THRESH_BRIGHT_MAX:
        return {"ok": False, "reason": "quality.bright", "metrics": metrics}
    if contrast < THRESH_CONTRAST_MIN:
        return {"ok": False, "reason": "quality.flat", "metrics": metrics}
    if mask is not None and coverage < THRESH_COVERAGE_MIN:
        return {"ok": False, "reason": "quality.tooFar", "metrics": metrics}
    if mask is not None and coverage > THRESH_COVERAGE_MAX:
        return {"ok": False, "reason": "quality.tooClose", "metrics": metrics}

    return {"ok": True, "reason": None, "metrics": metrics}


# ─── Step 2: Lesion Segmentation ───────────────────────────────────────────────


def segment_lesion_opencv(img: np.ndarray) -> np.ndarray:
    """
    OpenCV fallback segmentation — fast, no model required.

    Steps: gaussian blur → inverse Otsu (lesion darker than skin) →
    close+open morphology → keep largest connected component.

    Parameters
    ----------
    img : RGB uint8 [H, W, 3]

    Returns
    -------
    binary mask uint8 {0, 255} [H, W]
    """
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    _, mask = cv2.threshold(
        gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
    )

    kernel = np.ones((7, 7), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,  kernel)

    contours, _ = cv2.findContours(
        mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )
    if not contours:
        return np.zeros_like(mask)

    largest = max(contours, key=cv2.contourArea)
    clean = np.zeros_like(mask)
    cv2.drawContours(clean, [largest], -1, 255, -1)
    return clean


def segment_lesion_circle(
    img: np.ndarray, cx: int, cy: int, radius_frac: float = 0.3,
) -> np.ndarray:
    """
    Manual fallback — user tapped a point. Returns a circular mask.

    Parameters
    ----------
    img         : RGB uint8 [H, W, 3]
    cx, cy      : centre of the user tap in image coords
    radius_frac : radius as a fraction of min(H, W)

    Returns
    -------
    binary mask uint8 {0, 255} [H, W]
    """
    h, w = img.shape[:2]
    r = int(radius_frac * min(h, w))
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.circle(mask, (cx, cy), r, 255, thickness=-1)
    return mask


# ─── Step 3: Crop to Lesion ────────────────────────────────────────────────────


def crop_to_lesion(
    img: np.ndarray, mask: np.ndarray, padding: float = 0.15,
) -> np.ndarray:
    """
    Square crop centred on the mask bbox with 15% padding.
    Falls back to a 60% centre crop if the mask is empty/tiny.

    Parameters
    ----------
    img     : RGB uint8 [H, W, 3]
    mask    : binary uint8 [H, W]
    padding : fractional bbox expansion (0.15 = 15%)

    Returns
    -------
    RGB uint8 [H', W', 3] — close to square
    """
    h, w = img.shape[:2]

    if mask.sum() < 0.01 * mask.size * 255:
        crop_size = int(0.6 * min(h, w))
        y0 = (h - crop_size) // 2
        x0 = (w - crop_size) // 2
        return img[y0:y0 + crop_size, x0:x0 + crop_size]

    ys, xs = np.where(mask > 0)
    y_min, y_max = int(ys.min()), int(ys.max())
    x_min, x_max = int(xs.min()), int(xs.max())
    bw = x_max - x_min
    bh = y_max - y_min
    pad_w = int(bw * padding)
    pad_h = int(bh * padding)

    y0 = max(0, y_min - pad_h)
    y1 = min(h, y_max + pad_h)
    x0 = max(0, x_min - pad_w)
    x1 = min(w, x_max + pad_w)

    cw = x1 - x0
    ch = y1 - y0
    if cw > ch:
        diff = (cw - ch) // 2
        y0 = max(0, y0 - diff)
        y1 = min(h, y1 + diff)
    else:
        diff = (ch - cw) // 2
        x0 = max(0, x0 - diff)
        x1 = min(w, x1 + diff)

    return img[y0:y1, x0:x1]


# ─── Step 4: Hair Removal (DullRazor) ──────────────────────────────────────────


def dullrazor_hair_removal(img: np.ndarray) -> np.ndarray:
    """
    DullRazor variant — BlackHat morphology highlights dark thin lines on
    lighter skin, then INPAINT_TELEA fills them.

    Parameters
    ----------
    img : RGB uint8 [H, W, 3]

    Returns
    -------
    RGB uint8 [H, W, 3]
    """
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    kernel = cv2.getStructuringElement(cv2.MORPH_CROSS, (17, 17))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel)
    _, hair_mask = cv2.threshold(blackhat, 10, 255, cv2.THRESH_BINARY)
    return cv2.inpaint(img, hair_mask, inpaintRadius=1, flags=cv2.INPAINT_TELEA)


# ─── Step 5: Shades of Gray color constancy ────────────────────────────────────


def shades_of_gray(img: np.ndarray, p: int = 6) -> np.ndarray:
    """
    Minkowski p-norm illuminant estimation (p=6 = ISIC 2017 top result).

    Parameters
    ----------
    img : RGB uint8 [H, W, 3]
    p   : norm order; p→∞ = max-RGB, p=1 = grey-world

    Returns
    -------
    RGB uint8 [H, W, 3], illuminant-normalised
    """
    img_f = img.astype(np.float32)
    # Per-channel Minkowski p-norm
    norms = np.power(
        np.mean(np.power(img_f, p), axis=(0, 1)),
        1.0 / p,
    )
    gray_avg = norms.mean()
    scale = gray_avg / (norms + 1e-6)
    out = img_f * scale
    return np.clip(out, 0, 255).astype(np.uint8)


# ─── Step 6: CLAHE illumination normalisation ──────────────────────────────────


def clahe_illumination(
    img: np.ndarray, clip_limit: float = 2.0, tile: int = 8,
) -> np.ndarray:
    """
    Contrast-Limited Adaptive Histogram Equalisation on the L channel of LAB.

    Parameters
    ----------
    img        : RGB uint8 [H, W, 3]
    clip_limit : CLAHE clip value (2.0 = subtle, 4.0 = strong)
    tile       : 8 → 8×8 grid

    Returns
    -------
    RGB uint8 [H, W, 3]
    """
    lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2RGB)


# ─── Step 7: Resize ────────────────────────────────────────────────────────────


def resize_to_input(img: np.ndarray, size: int = 224) -> np.ndarray:
    """
    Bilinear resize to the model's input resolution.

    NOTE: cv2.resize uses INTER_LINEAR by default, which is what the
    training pipeline used. JS implementations must match this — see
    preprocessing.ts for the bilinear reference.
    """
    return cv2.resize(img, (size, size), interpolation=cv2.INTER_LINEAR)


# ─── Step 8: To Model Input ────────────────────────────────────────────────────
#
# █████████████████████████████████████████████████████████████████████████████
# █                                                                           █
# █  CRITICAL: DO NOT DIVIDE BY 255.                                          █
# █  The model expects float32 inputs in [0, 255] (NOT [0, 1]).               █
# █  It has its own internal normalisation. Dividing here makes the model     █
# █  see the input at 1/255 the scale → it outputs garbage. This is the       █
# █  single most common production bug in TFLite pipelines.                   █
# █                                                                           █
# █████████████████████████████████████████████████████████████████████████████


def to_model_input(img: np.ndarray) -> np.ndarray:
    """
    Convert the prepared uint8 RGB image to a float32 model tensor.

    img : RGB uint8 [224, 224, 3]
    Returns: float32 [224, 224, 3] in [0, 255]   (NOT [0, 1])
    """
    assert img.dtype == np.uint8, "to_model_input expects uint8"
    return img.astype(np.float32)


# ─── Orchestrator ──────────────────────────────────────────────────────────────


def preprocess_for_inference(
    img: np.ndarray,
    enable_quality_check: bool = True,
    enable_hair_removal: bool = True,
    enable_clahe: bool = True,
    input_size: int = 224,
    timings: Optional[PipelineTimings] = None,
) -> tuple[Optional[np.ndarray], QualityResult]:
    """
    Run the full 8-step pipeline.

    Parameters
    ----------
    img                  : RGB uint8 of any size
    enable_quality_check : if False, accept any input and just preprocess it
    enable_hair_removal  : DullRazor
    enable_clahe         : illumination normalisation
    input_size           : model input resolution (default 224)
    timings              : optional sink for per-step ms — useful in debug

    Returns
    -------
    (tensor, quality)
      tensor  : float32 [input_size, input_size, 3] in [0, 255], or None
                if quality gating rejected the photo.
      quality : QualityResult dict
    """
    assert img.dtype == np.uint8 and img.ndim == 3 and img.shape[2] == 3, \
        "preprocess_for_inference expects RGB uint8 [H, W, 3]"

    t_total = time.perf_counter()

    # 2. Segment — needed before quality (for coverage metric) but also
    #    used downstream for cropping.
    t0 = time.perf_counter()
    mask = segment_lesion_opencv(img)
    if timings is not None:
        timings.segment_lesion = (time.perf_counter() - t0) * 1000

    # 1. Quality
    t0 = time.perf_counter()
    quality = quality_check(img, mask)
    if timings is not None:
        timings.quality_check = (time.perf_counter() - t0) * 1000

    if enable_quality_check and not quality["ok"]:
        if timings is not None:
            timings.total = (time.perf_counter() - t_total) * 1000
        return None, quality

    # 3. Crop
    t0 = time.perf_counter()
    img = crop_to_lesion(img, mask)
    if timings is not None:
        timings.crop_to_lesion = (time.perf_counter() - t0) * 1000

    # 4. Hair removal
    if enable_hair_removal:
        t0 = time.perf_counter()
        img = dullrazor_hair_removal(img)
        if timings is not None:
            timings.hair_removal = (time.perf_counter() - t0) * 1000

    # 5. Color constancy
    t0 = time.perf_counter()
    img = shades_of_gray(img, p=6)
    if timings is not None:
        timings.color_constancy = (time.perf_counter() - t0) * 1000

    # 6. CLAHE
    if enable_clahe:
        t0 = time.perf_counter()
        img = clahe_illumination(img)
        if timings is not None:
            timings.clahe = (time.perf_counter() - t0) * 1000

    # 7. Resize
    t0 = time.perf_counter()
    img = resize_to_input(img, input_size)
    if timings is not None:
        timings.resize = (time.perf_counter() - t0) * 1000

    # 8. To float
    t0 = time.perf_counter()
    tensor = to_model_input(img)
    if timings is not None:
        timings.to_float = (time.perf_counter() - t0) * 1000
        timings.total = (time.perf_counter() - t_total) * 1000

    return tensor, quality


# ─── Convenience for visual debugging ──────────────────────────────────────────


@dataclass
class PipelineStages:
    """Container of every intermediate image, populated by `debug_pipeline`."""
    raw:             Optional[np.ndarray] = None
    mask:            Optional[np.ndarray] = None
    cropped:         Optional[np.ndarray] = None
    hair_removed:    Optional[np.ndarray] = None
    color_corrected: Optional[np.ndarray] = None
    clahe:           Optional[np.ndarray] = None
    resized:         Optional[np.ndarray] = None
    tensor:          Optional[np.ndarray] = None
    quality:         Optional[QualityResult] = None
    timings:         PipelineTimings = field(default_factory=PipelineTimings)


def debug_pipeline(
    img: np.ndarray,
    enable_quality_check: bool = False,   # default off for debug — see everything
    enable_hair_removal: bool = True,
    enable_clahe: bool = True,
    input_size: int = 224,
) -> PipelineStages:
    """
    Same pipeline as `preprocess_for_inference`, but retains every intermediate
    image so callers can visualise them side-by-side in a notebook.
    """
    stages = PipelineStages(raw=img.copy())

    stages.mask = segment_lesion_opencv(img)
    stages.quality = quality_check(img, stages.mask)
    if enable_quality_check and not stages.quality["ok"]:
        return stages

    stages.cropped = crop_to_lesion(img, stages.mask)
    cur = stages.cropped

    if enable_hair_removal:
        stages.hair_removed = dullrazor_hair_removal(cur)
        cur = stages.hair_removed

    stages.color_corrected = shades_of_gray(cur, p=6)
    cur = stages.color_corrected

    if enable_clahe:
        stages.clahe = clahe_illumination(cur)
        cur = stages.clahe

    stages.resized = resize_to_input(cur, input_size)
    stages.tensor  = to_model_input(stages.resized)
    return stages


__all__ = [
    "QualityMetrics",
    "QualityResult",
    "PipelineTimings",
    "PipelineStages",
    "THRESH_SHARPNESS_MIN",
    "THRESH_BRIGHT_MIN",
    "THRESH_BRIGHT_MAX",
    "THRESH_CONTRAST_MIN",
    "THRESH_COVERAGE_MIN",
    "THRESH_COVERAGE_MAX",
    "quality_check",
    "segment_lesion_opencv",
    "segment_lesion_circle",
    "crop_to_lesion",
    "dullrazor_hair_removal",
    "shades_of_gray",
    "clahe_illumination",
    "resize_to_input",
    "to_model_input",
    "preprocess_for_inference",
    "debug_pipeline",
]
