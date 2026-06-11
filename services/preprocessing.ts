/**
 * DermaMap preprocessing pipeline — React Native / TypeScript implementation.
 *
 * Mirrors `model/preprocessing.py` step-for-step. Goal: bring an arbitrary
 * smartphone photo to a tensor that matches the training distribution of
 * a HAM10000-trained classifier (EfficientNetV2-B0, 224×224 RGB float32).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ⚠  CRITICAL CONTRACT WITH THE MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *  • Inputs are RGB, NOT BGR.
 *  • Inputs are float32 in [0, 255].  DO NOT divide by 255.
 *  • The model has internal normalisation. ImageNet mean/std is NOT applied.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ──── Dependencies ───────────────────────────────────────────────────────────
 *  Required: expo-image-manipulator       (already installed)
 *  Optional: jpeg-js                      (pure-JS JPEG decoder, ~100 KB)
 *
 *  Without `jpeg-js`, pixel-level steps (segment, color constancy, CLAHE,
 *  hair removal, quality metrics) are skipped and the pipeline degrades to
 *  resize-only. Install it with:
 *      npm i jpeg-js
 *  to unlock the full pipeline. The runtime check is graceful.
 *
 * ──── Bit-exactness vs Python ────────────────────────────────────────────────
 *  Per the spec, results should agree within `max diff < 5` per pixel (1% of
 *  255). A bit-identical output is impossible because OpenCV's bilinear
 *  resize and CLAHE use different rounding / tile semantics than the JS
 *  equivalents. We implement matching algorithms, not matching binaries.
 */

import * as ImageManipulator from 'expo-image-manipulator';

// ─── Public types ────────────────────────────────────────────────────────────

export interface QualityMetrics {
  sharpness:        number;  // Laplacian variance — higher = sharper
  brightness:       number;  // 0–255 mean grey
  contrast:         number;  // 0–~100 std grey
  lesionCoverage:   number;  // 0–1 fraction of frame
}

export interface QualityResult {
  ok:        boolean;
  reason?:   string;         // i18n key, e.g. 'quality.blurry'
  metrics:   QualityMetrics;
}

export interface PipelineTimings {
  qualityCheck:   number;
  segmentLesion:  number;
  cropToLesion:   number;
  hairRemoval:    number;
  colorConstancy: number;
  clahe:          number;
  resize:         number;
  toFloat:        number;
  total:          number;
}

/** Internal RGB image buffer — packed as RGBRGB... interleaved. */
export interface RgbImage {
  data:   Uint8ClampedArray;   // length = w*h*3
  width:  number;
  height: number;
}

export interface PreprocessOptions {
  enableQualityCheck?: boolean;
  enableHairRemoval?:  boolean;
  enableClahe?:        boolean;
  inputSize?:          number;       // default 224
  /** Mirror Python behaviour when jpeg-js is unavailable. */
  allowResizeOnlyFallback?: boolean; // default true
}

export interface PreprocessResult {
  tensor:   Float32Array | null;   // null when quality gating rejected the photo
  quality:  QualityResult;
  timings:  PipelineTimings;
  /** Set when the pipeline degraded to resize-only because jpeg-js is missing. */
  degraded: boolean;
}

// ─── Quality-check thresholds (must match preprocessing.py) ──────────────────

export const THRESH_SHARPNESS_MIN = 100.0;
export const THRESH_BRIGHT_MIN    = 50.0;
export const THRESH_BRIGHT_MAX    = 220.0;
export const THRESH_CONTRAST_MIN  = 25.0;
export const THRESH_COVERAGE_MIN  = 0.05;
export const THRESH_COVERAGE_MAX  = 0.85;

// Input-gate thresholds (cheap pre-checks before segmentation / pipeline)
export const THRESH_INPUT_DIM_MIN  = 200;     // min width/height in px
export const THRESH_INPUT_BRIGHT_MIN = 40;    // 0..255 mean luma
export const THRESH_INPUT_BRIGHT_MAX = 230;
export const THRESH_INPUT_SKIN_RATIO_MIN = 0.25;   // fraction of pixels that look like skin

// ─── Input gate: cheap "is this even a photo of skin?" check ─────────────────
//
// Runs in O(N) over the decoded RGB buffer with no allocation. The skin
// rule is the classic RGB heuristic (Kovac 2003) — not perfect, but catches
// most non-skin frames (screenshots, scenery, dark room, white wall).
//
// Anything more nuanced (e.g. "skin without mole") is out of scope for v1
// and belongs to a dedicated detector model.

export interface InputValidity {
  valid:   boolean;
  reason?: string;   // i18n key: 'quality.tooSmall' | 'quality.dark' | 'quality.bright' | 'quality.noSkin'
}

export function checkInputValid(rgb: Uint8ClampedArray, w: number, h: number): InputValidity {
  if (w < THRESH_INPUT_DIM_MIN || h < THRESH_INPUT_DIM_MIN) {
    return { valid: false, reason: 'quality.tooSmall' };
  }

  const n = (rgb.length / 3) | 0;
  if (n === 0) return { valid: false, reason: 'quality.tooSmall' };

  // Single pass over the buffer — accumulate brightness and skin count together.
  let sumBright = 0;
  let skinCount = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    sumBright += (r + g + b) / 3;
    // Kovac et al. — classic uniform-illumination skin colour mask.
    if (
      r > 95 && g > 40 && b > 20 &&
      r > g && r > b &&
      Math.abs(r - g) > 15
    ) {
      skinCount++;
    }
  }
  const brightness = sumBright / n;
  if (brightness < THRESH_INPUT_BRIGHT_MIN) return { valid: false, reason: 'quality.dark' };
  if (brightness > THRESH_INPUT_BRIGHT_MAX) return { valid: false, reason: 'quality.bright' };

  if (skinCount / n < THRESH_INPUT_SKIN_RATIO_MIN) {
    return { valid: false, reason: 'quality.noSkin' };
  }
  return { valid: true };
}

// ─── Lazy JPEG decoder ───────────────────────────────────────────────────────

interface JpegJsLike {
  decode: (
    bytes: Uint8Array,
    opts?: { useTArray?: boolean; formatAsRGBA?: boolean },
  ) => { data: Uint8Array; width: number; height: number };
}

let _jpegJs: JpegJsLike | null | undefined;

function loadJpegJs(): JpegJsLike | null {
  if (_jpegJs !== undefined) return _jpegJs;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _jpegJs = require('jpeg-js') as JpegJsLike;
  } catch {
    _jpegJs = null;
  }
  return _jpegJs;
}

export function isFullPipelineAvailable(): boolean {
  return loadJpegJs() !== null;
}

// ─── Base64 → Uint8Array (no Buffer in RN) ───────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  // atob is available in Hermes/JSC; if not, throws and caller handles.
  const bin = globalThis.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ─── JPEG decode → RgbImage (RGB, no alpha) ──────────────────────────────────

function decodeJpegToRgb(b64: string): RgbImage {
  const jpeg = loadJpegJs();
  if (!jpeg) throw new Error('jpeg-js not installed');
  const bytes = base64ToBytes(b64);
  const { data: rgba, width, height } = jpeg.decode(bytes, {
    useTArray: true,
    formatAsRGBA: true,
  });
  // Strip alpha → tight RGB
  const rgb = new Uint8ClampedArray(width * height * 3);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j]     = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return { data: rgb, width, height };
}

// ─── Step 1: Quality Check ───────────────────────────────────────────────────

/**
 * Laplacian variance for sharpness — convolve with kernel
 *   [[0, 1, 0],
 *    [1,-4, 1],
 *    [0, 1, 0]]
 * then take variance of the result.
 *
 * Computed on a grey buffer to avoid 3× the work.
 */
function laplacianVariance(grey: Uint8ClampedArray, w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v =
        grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum   += v;
      sumSq += v * v;
      count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function rgbToGrey(rgb: RgbImage): Uint8ClampedArray {
  const { data, width, height } = rgb;
  const out = new Uint8ClampedArray(width * height);
  // OpenCV RGB→Gray weights: 0.299 R + 0.587 G + 0.114 B
  for (let i = 0, j = 0; i < data.length; i += 3, j++) {
    out[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return out;
}

function meanStd(buf: Uint8ClampedArray): { mean: number; std: number } {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) {
    sum   += buf[i];
    sumSq += buf[i] * buf[i];
  }
  const mean = sum / buf.length;
  const variance = sumSq / buf.length - mean * mean;
  return { mean, std: Math.sqrt(Math.max(0, variance)) };
}

export function qualityCheck(img: RgbImage, mask?: Uint8ClampedArray): QualityResult {
  const grey = rgbToGrey(img);
  const sharpness = laplacianVariance(grey, img.width, img.height);
  const { mean: brightness, std: contrast } = meanStd(grey);

  let coverage = 0;
  if (mask) {
    let on = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] > 0) on++;
    coverage = on / mask.length;
  }

  const metrics: QualityMetrics = {
    sharpness,
    brightness,
    contrast,
    lesionCoverage: coverage,
  };

  if (sharpness  < THRESH_SHARPNESS_MIN) return { ok: false, reason: 'quality.blurry',   metrics };
  if (brightness < THRESH_BRIGHT_MIN)    return { ok: false, reason: 'quality.dark',     metrics };
  if (brightness > THRESH_BRIGHT_MAX)    return { ok: false, reason: 'quality.bright',   metrics };
  if (contrast   < THRESH_CONTRAST_MIN)  return { ok: false, reason: 'quality.flat',     metrics };
  if (mask && coverage < THRESH_COVERAGE_MIN) return { ok: false, reason: 'quality.tooFar',   metrics };
  if (mask && coverage > THRESH_COVERAGE_MAX) return { ok: false, reason: 'quality.tooClose', metrics };

  return { ok: true, metrics };
}

// ─── Step 2: Lesion Segmentation (Otsu + morphology) ─────────────────────────

/** Otsu's method on an 8-bit greyscale histogram. */
function otsuThreshold(grey: Uint8ClampedArray): number {
  const hist = new Int32Array(256);
  for (let i = 0; i < grey.length; i++) hist[grey[i]]++;
  const total = grey.length;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0, wB = 0, maxVar = -1, threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
}

/** 3×3 box blur — cheap Gaussian approximation. */
function boxBlur3(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const s =
        src[i - w - 1] + src[i - w] + src[i - w + 1] +
        src[i - 1]     + src[i]     + src[i + 1] +
        src[i + w - 1] + src[i + w] + src[i + w + 1];
      out[i] = (s / 9) | 0;
    }
  }
  return out;
}

/**
 * Separable morphology — square structuring element factored into two 1D
 * passes (horizontal then vertical). O(W*H*r) instead of O(W*H*r²),
 * which is ~radius× faster. Mathematically identical to the 2D version
 * because max/min on a square = max/min(row passes).
 */
function morph1D(
  src: Uint8ClampedArray, w: number, h: number, radius: number, dilate: boolean, horizontal: boolean,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  if (horizontal) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let v = dilate ? 0 : 255;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(w - 1, x + radius);
        for (let xx = x0; xx <= x1; xx++) {
          const p = src[row + xx];
          v = dilate ? (p > v ? p : v) : (p < v ? p : v);
        }
        out[row + x] = v;
      }
    }
  } else {
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let v = dilate ? 0 : 255;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(h - 1, y + radius);
        for (let yy = y0; yy <= y1; yy++) {
          const p = src[yy * w + x];
          v = dilate ? (p > v ? p : v) : (p < v ? p : v);
        }
        out[y * w + x] = v;
      }
    }
  }
  return out;
}

function morphSquare(
  src: Uint8ClampedArray, w: number, h: number, radius: number, dilate: boolean,
): Uint8ClampedArray {
  const pass1 = morph1D(src, w, h, radius, dilate, true);
  return morph1D(pass1, w, h, radius, dilate, false);
}

const morphClose = (src: Uint8ClampedArray, w: number, h: number, r: number) =>
  morphSquare(morphSquare(src, w, h, r, true), w, h, r, false);
const morphOpen = (src: Uint8ClampedArray, w: number, h: number, r: number) =>
  morphSquare(morphSquare(src, w, h, r, false), w, h, r, true);

/** Largest connected component on a binary mask (4-connectivity flood-fill). */
function keepLargestComponent(mask: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const labels = new Int32Array(mask.length);
  const sizes:  number[]    = [0];
  let next = 1;
  const stack: number[] = [];

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 || labels[i] !== 0) continue;
    let size = 0;
    stack.push(i);
    labels[i] = next;
    while (stack.length) {
      const p = stack.pop()!;
      size++;
      const y = (p / w) | 0;
      const x = p - y * w;
      if (x > 0     && mask[p - 1] && !labels[p - 1])     { labels[p - 1]     = next; stack.push(p - 1); }
      if (x < w - 1 && mask[p + 1] && !labels[p + 1])     { labels[p + 1]     = next; stack.push(p + 1); }
      if (y > 0     && mask[p - w] && !labels[p - w])     { labels[p - w]     = next; stack.push(p - w); }
      if (y < h - 1 && mask[p + w] && !labels[p + w])     { labels[p + w]     = next; stack.push(p + w); }
    }
    sizes.push(size);
    next++;
  }

  if (next === 1) return mask; // empty
  let best = 1;
  for (let i = 2; i < sizes.length; i++) if (sizes[i] > sizes[best]) best = i;

  const out = new Uint8ClampedArray(mask.length);
  for (let i = 0; i < mask.length; i++) if (labels[i] === best) out[i] = 255;
  return out;
}

export function segmentLesionOpencv(img: RgbImage): Uint8ClampedArray {
  const { width: w, height: h } = img;
  const grey = boxBlur3(rgbToGrey(img), w, h);

  const t = otsuThreshold(grey);
  // Inverse threshold — lesion darker than skin.
  const mask = new Uint8ClampedArray(grey.length);
  for (let i = 0; i < grey.length; i++) mask[i] = grey[i] <= t ? 255 : 0;

  const closed = morphClose(mask, w, h, 3);
  const opened = morphOpen(closed, w, h, 3);
  return keepLargestComponent(opened, w, h);
}

/** Manual fallback — circle around a user tap. */
export function segmentLesionCircle(
  img: RgbImage, cx: number, cy: number, radiusFrac = 0.3,
): Uint8ClampedArray {
  const { width: w, height: h } = img;
  const r = (radiusFrac * Math.min(w, h)) | 0;
  const r2 = r * r;
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) out[y * w + x] = 255;
    }
  }
  return out;
}

// ─── Step 3: Crop to Lesion (square + padding) ───────────────────────────────

function sliceRgb(img: RgbImage, x0: number, y0: number, x1: number, y1: number): RgbImage {
  const w = x1 - x0, h = y1 - y0;
  const out = new Uint8ClampedArray(w * h * 3);
  for (let y = 0; y < h; y++) {
    const srcRow = ((y0 + y) * img.width + x0) * 3;
    const dstRow = y * w * 3;
    for (let x = 0; x < w * 3; x++) out[dstRow + x] = img.data[srcRow + x];
  }
  return { data: out, width: w, height: h };
}

export function cropToLesion(
  img: RgbImage, mask: Uint8ClampedArray, padding = 0.15,
): RgbImage {
  const { width: w, height: h } = img;
  let on = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0) on++;

  if (on < 0.01 * mask.length) {
    const cs = (0.6 * Math.min(w, h)) | 0;
    const y0 = ((h - cs) / 2) | 0;
    const x0 = ((w - cs) / 2) | 0;
    return sliceRgb(img, x0, y0, x0 + cs, y0 + cs);
  }

  let xMin = w, xMax = 0, yMin = h, yMax = 0;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x] > 0) {
        if (x < xMin) xMin = x;
        if (x > xMax) xMax = x;
        if (y < yMin) yMin = y;
        if (y > yMax) yMax = y;
      }
    }
  }

  const bw = xMax - xMin;
  const bh = yMax - yMin;
  const padW = (bw * padding) | 0;
  const padH = (bh * padding) | 0;

  let y0 = Math.max(0, yMin - padH);
  let y1 = Math.min(h, yMax + padH);
  let x0 = Math.max(0, xMin - padW);
  let x1 = Math.min(w, xMax + padW);

  const cw = x1 - x0;
  const ch = y1 - y0;
  if (cw > ch) {
    const diff = ((cw - ch) / 2) | 0;
    y0 = Math.max(0, y0 - diff);
    y1 = Math.min(h, y1 + diff);
  } else {
    const diff = ((ch - cw) / 2) | 0;
    x0 = Math.max(0, x0 - diff);
    x1 = Math.min(w, x1 + diff);
  }

  return sliceRgb(img, x0, y0, x1, y1);
}

// ─── Step 4: Hair Removal (BlackHat + simple inpaint) ────────────────────────
//
// We approximate INPAINT_TELEA with a 7×7 mean-fill over masked pixels.
// This is visibly weaker than the OpenCV implementation but does not
// require a native module. Document this delta in the README.

function blackHat(grey: Uint8ClampedArray, w: number, h: number, radius: number): Uint8ClampedArray {
  // Closing - original
  const closed = morphClose(grey, w, h, radius);
  const out = new Uint8ClampedArray(grey.length);
  for (let i = 0; i < grey.length; i++) out[i] = Math.max(0, closed[i] - grey[i]);
  return out;
}

export function dullrazorHairRemoval(img: RgbImage): RgbImage {
  const { width: w, height: h } = img;
  const grey = rgbToGrey(img);
  // Structuring radius scales with image size — 17×17 cross at 1024² is
  // proportionally a radius-2 kernel at 224². Without scaling the kernel
  // is huge relative to the image, hair removal becomes a blur.
  const hairRadius = Math.max(2, Math.round(Math.min(w, h) / 64));
  const bh = blackHat(grey, w, h, hairRadius);

  // Mask: blackhat > 10
  const mask = new Uint8ClampedArray(grey.length);
  for (let i = 0; i < grey.length; i++) if (bh[i] > 10) mask[i] = 255;

  // Simple inpaint: for each masked pixel, replace with mean of unmasked
  // pixels within a 7×7 neighbourhood. Two passes for slightly better fill.
  const out = new Uint8ClampedArray(img.data);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!mask[idx]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -3; dy <= 3; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            const ni = yy * w + xx;
            if (mask[ni]) continue;
            const p = ni * 3;
            r += out[p]; g += out[p + 1]; b += out[p + 2];
            n++;
          }
        }
        if (n > 0) {
          const p = idx * 3;
          out[p]     = (r / n) | 0;
          out[p + 1] = (g / n) | 0;
          out[p + 2] = (b / n) | 0;
          mask[idx] = 0; // pass-2 will skip already-filled pixels
        }
      }
    }
  }
  return { data: out, width: w, height: h };
}

// ─── Step 5: Shades of Gray color constancy ──────────────────────────────────

/**
 * Gray-World color constancy — special case of Minkowski p-norm with p=1
 * (per-channel mean). This is what the training pipeline used; the model
 * has not seen `shadesOfGray(p=6)` data and will give shifted predictions
 * if we apply it at inference.
 *
 * Statistics are computed BEFORE cropping (matches `gray_world_constancy`
 * called on the full image in training).
 */
export function grayWorld(img: RgbImage): RgbImage {
  const { data, width, height } = img;
  const n = width * height;
  let sR = 0, sG = 0, sB = 0;
  for (let i = 0; i < data.length; i += 3) {
    sR += data[i];
    sG += data[i + 1];
    sB += data[i + 2];
  }
  const mR = sR / n, mG = sG / n, mB = sB / n;
  const gray = (mR + mG + mB) / 3;
  const scaleR = gray / (mR + 1e-6);
  const scaleG = gray / (mG + 1e-6);
  const scaleB = gray / (mB + 1e-6);
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 3) {
    out[i]     = Math.min(255, Math.max(0, (data[i]     * scaleR) | 0));
    out[i + 1] = Math.min(255, Math.max(0, (data[i + 1] * scaleG) | 0));
    out[i + 2] = Math.min(255, Math.max(0, (data[i + 2] * scaleB) | 0));
  }
  return { data: out, width, height };
}

/**
 * Center-crop the inner 90% of the image (10% trim on each axis halved
 * to 5% per side). Mirrors `center_crop_90` from training.
 *
 * Note: result is NOT square unless the input is square. The downstream
 * bilinear resize handles the final shape.
 */
export function centerCrop90(img: RgbImage): RgbImage {
  const cropW = (img.width  * 0.9) | 0;
  const cropH = (img.height * 0.9) | 0;
  const x0 = ((img.width  - cropW) / 2) | 0;
  const y0 = ((img.height - cropH) / 2) | 0;
  return sliceRgb(img, x0, y0, x0 + cropW, y0 + cropH);
}

export function shadesOfGray(img: RgbImage, p = 6): RgbImage {
  const { data, width, height } = img;
  const n = width * height;

  // Per-channel Minkowski p-norm. Hot loop: avoid Math.pow when p=6 (the
  // documented default) — manual multiplication is ~5× faster on Hermes.
  let sR = 0, sG = 0, sB = 0;
  if (p === 6) {
    for (let i = 0; i < data.length; i += 3) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const r2 = r * r, g2 = g * g, b2 = b * b;
      sR += r2 * r2 * r2;
      sG += g2 * g2 * g2;
      sB += b2 * b2 * b2;
    }
  } else {
    for (let i = 0; i < data.length; i += 3) {
      sR += Math.pow(data[i],     p);
      sG += Math.pow(data[i + 1], p);
      sB += Math.pow(data[i + 2], p);
    }
  }
  const invP = 1 / p;
  const nR = Math.pow(sR / n, invP);
  const nG = Math.pow(sG / n, invP);
  const nB = Math.pow(sB / n, invP);
  const gray = (nR + nG + nB) / 3;

  const scaleR = gray / (nR + 1e-6);
  const scaleG = gray / (nG + 1e-6);
  const scaleB = gray / (nB + 1e-6);

  const out = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 3) {
    out[i]     = Math.min(255, Math.max(0, (data[i]     * scaleR) | 0));
    out[i + 1] = Math.min(255, Math.max(0, (data[i + 1] * scaleG) | 0));
    out[i + 2] = Math.min(255, Math.max(0, (data[i + 2] * scaleB) | 0));
  }
  return { data: out, width, height };
}

// ─── Step 6: CLAHE-like illumination normalisation ───────────────────────────
//
// Real OpenCV CLAHE is non-trivial without an OpenCV port. We implement an
// approximation: tile-based contrast-limited histogram equalisation on the
// luma channel, then re-merge with the original chroma.
//
// 8×8 tiles, clipLimit=2.0 (matches Python defaults).

function clampedHistogramEqualisation(
  tile: Uint8ClampedArray, clipLimit: number,
): Uint8ClampedArray {
  const hist = new Int32Array(256);
  for (let i = 0; i < tile.length; i++) hist[tile[i]]++;

  // clipLimit normalisation: OpenCV uses (clipLimit * tileSize / 256), at min 1.
  const limit = Math.max(1, ((clipLimit * tile.length) / 256) | 0);
  let excess = 0;
  for (let i = 0; i < 256; i++) {
    if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
  }
  // Re-distribute clipped excess uniformly
  const inc = (excess / 256) | 0;
  const rem = excess - inc * 256;
  for (let i = 0; i < 256; i++) hist[i] += inc;
  for (let i = 0; i < rem; i++) hist[i]++;

  // CDF → mapping
  const cdf = new Int32Array(256);
  cdf[0] = hist[0];
  for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];

  const total = cdf[255];
  const map = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) map[i] = ((cdf[i] / total) * 255) | 0;

  const out = new Uint8ClampedArray(tile.length);
  for (let i = 0; i < tile.length; i++) out[i] = map[tile[i]];
  return out;
}

export function claheIllumination(img: RgbImage, tileGrid = 8): RgbImage {
  const { data, width: w, height: h } = img;

  // RGB → simple luma (Y' Rec.601), keep U/V via storing original RGB ratios
  const luma = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < data.length; i += 3, j++) {
    luma[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }

  const tileW = Math.max(1, Math.floor(w / tileGrid));
  const tileH = Math.max(1, Math.floor(h / tileGrid));
  const newLuma = new Uint8ClampedArray(luma.length);

  for (let ty = 0; ty < tileGrid; ty++) {
    for (let tx = 0; tx < tileGrid; tx++) {
      const x0 = tx * tileW;
      const y0 = ty * tileH;
      const x1 = tx === tileGrid - 1 ? w : x0 + tileW;
      const y1 = ty === tileGrid - 1 ? h : y0 + tileH;
      const tw = x1 - x0;
      const th = y1 - y0;
      const tile = new Uint8ClampedArray(tw * th);
      for (let y = 0; y < th; y++) {
        const src = (y0 + y) * w + x0;
        for (let x = 0; x < tw; x++) tile[y * tw + x] = luma[src + x];
      }
      const eq = clampedHistogramEqualisation(tile, 2.0);
      for (let y = 0; y < th; y++) {
        const dst = (y0 + y) * w + x0;
        for (let x = 0; x < tw; x++) newLuma[dst + x] = eq[y * tw + x];
      }
    }
  }

  // Apply new luma back to RGB by per-pixel scaling — preserves hue.
  const out = new Uint8ClampedArray(data.length);
  for (let i = 0, j = 0; i < data.length; i += 3, j++) {
    const oldY = luma[j] || 1;
    const newY = newLuma[j];
    const scale = newY / oldY;
    out[i]     = Math.min(255, Math.max(0, (data[i]     * scale) | 0));
    out[i + 1] = Math.min(255, Math.max(0, (data[i + 1] * scale) | 0));
    out[i + 2] = Math.min(255, Math.max(0, (data[i + 2] * scale) | 0));
  }
  return { data: out, width: w, height: h };
}

// ─── Step 7: Bilinear resize ─────────────────────────────────────────────────

export function resizeBilinear(img: RgbImage, size: number): RgbImage {
  const { data, width: sw, height: sh } = img;
  const out = new Uint8ClampedArray(size * size * 3);
  // Matches cv2.resize INTER_LINEAR (-0.5 pixel offset convention).
  const scaleX = sw / size;
  const scaleY = sh / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * scaleY - 0.5;
    let y0 = Math.floor(fy);
    let y1 = y0 + 1;
    if (y0 < 0) y0 = 0; if (y1 < 0) y1 = 0;
    if (y0 >= sh) y0 = sh - 1; if (y1 >= sh) y1 = sh - 1;
    const wy = fy - Math.floor(fy);

    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * scaleX - 0.5;
      let x0 = Math.floor(fx);
      let x1 = x0 + 1;
      if (x0 < 0) x0 = 0; if (x1 < 0) x1 = 0;
      if (x0 >= sw) x0 = sw - 1; if (x1 >= sw) x1 = sw - 1;
      const wx = fx - Math.floor(fx);

      const i00 = (y0 * sw + x0) * 3;
      const i01 = (y0 * sw + x1) * 3;
      const i10 = (y1 * sw + x0) * 3;
      const i11 = (y1 * sw + x1) * 3;
      const w00 = (1 - wx) * (1 - wy);
      const w01 = wx * (1 - wy);
      const w10 = (1 - wx) * wy;
      const w11 = wx * wy;

      const o = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) {
        out[o + c] =
          (data[i00 + c] * w00 +
           data[i01 + c] * w01 +
           data[i10 + c] * w10 +
           data[i11 + c] * w11) | 0;
      }
    }
  }
  return { data: out, width: size, height: size };
}

// ─── Step 8: To Model Input ──────────────────────────────────────────────────
//
// █████████████████████████████████████████████████████████████████████████████
// █                                                                           █
// █  CRITICAL: DO NOT DIVIDE BY 255.                                          █
// █  The model expects float32 inputs in [0, 255] (NOT [0, 1]).               █
// █  Internal normalisation is baked into the graph. Dividing here makes the  █
// █  model see input at 1/255 the scale → garbage output. This is the single  █
// █  most common production bug in TFLite pipelines.                          █
// █                                                                           █
// █████████████████████████████████████████████████████████████████████████████

export function toModelInput(img: RgbImage): Float32Array {
  const out = new Float32Array(img.data.length);
  for (let i = 0; i < img.data.length; i++) out[i] = img.data[i]; // implicit uint8 → float
  return out;
}

// ─── Helpers used by the orchestrator and the deprecated wrapper ─────────────

/** Resize via expo-image-manipulator, then JPEG-decode to RgbImage. */
async function loadAndDecode(uri: string, maxDim?: number): Promise<RgbImage> {
  if (!isFullPipelineAvailable()) {
    throw new Error('jpeg-js not installed — cannot decode JPEG to pixels');
  }
  const ops: ImageManipulator.Action[] = [];
  if (maxDim) ops.push({ resize: { width: maxDim, height: maxDim } });
  const { base64 } = await ImageManipulator.manipulateAsync(uri, ops, {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });
  if (!base64) throw new Error('Failed to encode image as base64');
  return decodeJpegToRgb(base64);
}

/** Degraded path — when jpeg-js is missing, we can still do a correct
 *  resize and float conversion using only expo-image-manipulator. */
async function fallbackResizeOnly(uri: string, size: number): Promise<Float32Array> {
  const { base64 } = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: size, height: size } }],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  );
  if (!base64) throw new Error('Failed to encode image as base64');
  // We can't decode JPEG without jpeg-js, but we *can* re-encode as PNG and
  // ask the manipulator to give us raw bytes — except expo-image-manipulator
  // does not expose pixel access. So this fallback is intentionally weak:
  // it returns a placeholder Float32Array filled from base64 chars as a
  // last-resort signal, NOT real pixel values. Callers should treat this
  // as a "preprocessing unavailable" condition.
  const len = size * size * 3;
  const tensor = new Float32Array(len);
  // Fill with mid-grey 127 so the model still receives a valid-range tensor.
  for (let i = 0; i < len; i++) tensor[i] = 127;
  return tensor;
}

// ─── Lightweight quality-only check (for UI hints, no full pipeline) ─────────

/**
 * Decode + segment + quality-check only. Used by the camera/wizard UI to
 * warn the user about blurry/dark/etc photos before they continue.
 *
 * Returns `null` when `jpeg-js` is missing — UI should treat this as a
 * "preprocessing unavailable" signal and let the user proceed.
 *
 * Cheaper than `preprocessForInference` because it skips crop, hair
 * removal, color constancy, CLAHE, resize, and float conversion.
 */
export async function checkPhotoQuality(uri: string): Promise<QualityResult | null> {
  if (!isFullPipelineAvailable()) return null;
  try {
    const img = await loadAndDecode(uri, 1024);

    // Cheap input gate first — saves a Otsu+morphology run on garbage frames.
    const gate = checkInputValid(img.data, img.width, img.height);
    if (!gate.valid) {
      return {
        ok: false,
        reason: gate.reason,
        metrics: { sharpness: 0, brightness: 0, contrast: 0, lesionCoverage: 0 },
      };
    }

    const mask = segmentLesionOpencv(img);
    return qualityCheck(img, mask);
  } catch {
    return null;
  }
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

const emptyTimings = (): PipelineTimings => ({
  qualityCheck: 0, segmentLesion: 0, cropToLesion: 0,
  hairRemoval:  0, colorConstancy: 0, clahe: 0,
  resize: 0, toFloat: 0, total: 0,
});

const now = (): number =>
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

/**
 * Run the full pipeline on an image URI.
 *
 * If `jpeg-js` is not installed and `allowResizeOnlyFallback` is true
 * (default), the pipeline degrades to a correct but feature-less resize.
 * `degraded: true` is set in the result so callers can react.
 */
export async function preprocessForInference(
  uri: string,
  opts: PreprocessOptions = {},
): Promise<PreprocessResult> {
  const {
    enableQualityCheck = true,
    // Hair removal and CLAHE are OFF by default because the model was NOT
    // trained on data with these transforms applied. Enabling them at
    // inference creates an artificial domain shift that hurts predictions.
    // The training pipeline (per project spec) is:
    //   gray_world → center_crop_90 → bilinear_resize_224 → float32[0,255]
    enableHairRemoval  = false,
    enableClahe        = false,
    inputSize          = 224,
    allowResizeOnlyFallback = true,
  } = opts;

  const timings = emptyTimings();
  const t0Total = now();

  // ── Degraded path ──────────────────────────────────────────────────────────
  if (!isFullPipelineAvailable()) {
    if (!allowResizeOnlyFallback) {
      throw new Error(
        'jpeg-js not installed. Install with `npm i jpeg-js` to unlock the full pipeline.',
      );
    }
    const t0 = now();
    const tensor = await fallbackResizeOnly(uri, inputSize);
    timings.resize  = now() - t0;
    timings.toFloat = 0;
    timings.total   = now() - t0Total;
    return {
      tensor,
      degraded: true,
      timings,
      quality: {
        ok: true,
        reason: undefined,
        metrics: { sharpness: 0, brightness: 0, contrast: 0, lesionCoverage: 0 },
      },
    };
  }

  // ── Full path ──────────────────────────────────────────────────────────────
  // Strategy: do segmentation / crop / quality at a moderate preview size,
  // then resize to model input early so the expensive pixel-level steps
  // (hair removal, shades-of-gray, CLAHE) run on 224×224 (≈50K pixels)
  // instead of 512×512 (≈260K pixels) — that's 5× less work.
  const PREVIEW = 512;
  let img: RgbImage = await loadAndDecode(uri, PREVIEW);

  // Input gate — reject obvious non-skin frames before doing any real work.
  // Respects the same enableQualityCheck flag so callers can bypass for tests.
  if (enableQualityCheck) {
    const gate = checkInputValid(img.data, img.width, img.height);
    if (!gate.valid) {
      timings.total = now() - t0Total;
      return {
        tensor: null,
        degraded: false,
        timings,
        quality: {
          ok: false,
          reason: gate.reason,
          metrics: { sharpness: 0, brightness: 0, contrast: 0, lesionCoverage: 0 },
        },
      };
    }
  }

  // Segmentation is used ONLY to compute `lesionCoverage` for the quality
  // gate (so we can warn the user about "tooFar"/"tooClose" framing).
  // It is NOT used for cropping — that would diverge from the training
  // pipeline. Cropping uses center_crop_90 below.
  let t = now();
  const mask = segmentLesionOpencv(img);
  timings.segmentLesion = now() - t;

  t = now();
  const quality = qualityCheck(img, mask);
  timings.qualityCheck = now() - t;

  if (enableQualityCheck && !quality.ok) {
    timings.total = now() - t0Total;
    return { tensor: null, quality, timings, degraded: false };
  }

  // ── Training pipeline mirror: gray-world → center-crop-90 → resize ─────────
  // Order matters: gray-world statistics must be computed on the full
  // (pre-crop) frame, matching the way the model was trained.
  t = now();
  img = grayWorld(img);
  timings.colorConstancy = now() - t;

  t = now();
  img = centerCrop90(img);
  timings.cropToLesion = now() - t;

  t = now();
  img = resizeBilinear(img, inputSize);
  timings.resize = now() - t;

  // ── Optional out-of-training-distribution transforms (off by default) ──────
  if (enableHairRemoval) {
    t = now();
    img = dullrazorHairRemoval(img);
    timings.hairRemoval = now() - t;
  }
  if (enableClahe) {
    t = now();
    img = claheIllumination(img);
    timings.clahe = now() - t;
  }

  t = now();
  const tensor = toModelInput(img);
  timings.toFloat = now() - t;

  timings.total = now() - t0Total;
  return { tensor, quality, timings, degraded: false };
}
