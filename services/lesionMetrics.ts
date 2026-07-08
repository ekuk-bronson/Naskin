/**
 * lesionMetrics.ts — real ABCD features from a segmentation mask.
 *
 * Consumes the binary lesion mask produced by the on-device segmentation
 * model (`assets/model/lesion_seg.tflite`, 256×256 sigmoid) plus the same
 * RGB frame, and computes clinically-motivated ABCD values in [0, 1]:
 *
 *   A — Asymmetry    non-overlap when folded about the lesion's principal axes
 *   B — Border       irregularity = 1 − circularity (4π·area / perimeter²)
 *   C — Color        number of distinct clinical colors present inside the mask
 *   D — Diameter     lesion major-axis length relative to the frame
 *
 * E (Evolution) is temporal and lives in history comparison, not here.
 *
 * Pure, dependency-free: operates on plain typed arrays so it is trivially
 * unit-testable and runs the same on device and in Node.
 */

export interface LesionMetrics {
  asymmetry: number; // [0,1]
  border: number;    // [0,1]
  color: number;     // [0,1]
  diameter: number;  // [0,1]
  /** Raw intermediates, handy for debugging / display. */
  raw: {
    area: number;          // foreground pixels
    coverage: number;      // area / (w*h)
    perimeter: number;
    circularity: number;
    colorCount: number;    // 1..6 distinct clinical colors
    majorAxisFrac: number; // major axis / frame diagonal
    orientationRad: number;
  };
}

const THRESH = 0.5;
/** Minimum share of lesion area for a color to "count" (noise guard). */
const COLOR_MIN_SHARE = 0.03;

/**
 * @param mask  length w*h, values in [0,1] (sigmoid) or {0,1}
 * @param rgb   length w*h*3, uint8 RGB of the SAME frame at w×h
 */
export function computeLesionMetrics(
  mask: ArrayLike<number>,
  rgb: ArrayLike<number>,
  w = 256,
  h = 256,
): LesionMetrics | null {
  // ── 1. Foreground stats: area, centroid, second moments ──
  let area = 0;
  let sx = 0, sy = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > THRESH) { area++; sx += x; sy += y; }
    }
  }
  if (area < 25) return null; // no meaningful lesion found

  const cx = sx / area, cy = sy / area;

  let mu20 = 0, mu02 = 0, mu11 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > THRESH) {
        const dx = x - cx, dy = y - cy;
        mu20 += dx * dx; mu02 += dy * dy; mu11 += dx * dy;
      }
    }
  }
  mu20 /= area; mu02 /= area; mu11 /= area;

  // Orientation of the major axis and covariance eigenvalues.
  const theta = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  const common = Math.sqrt((mu20 - mu02) * (mu20 - mu02) + 4 * mu11 * mu11);
  const lambdaMax = (mu20 + mu02 + common) / 2;
  const lambdaMin = (mu20 + mu02 - common) / 2;

  // ── 2. Border: denoise contour, then perimeter → circularity ──
  // The raw 256² segmentation contour is pixel-jagged (staircase + model
  // noise); counting boundary pixels on it over-estimates the perimeter and
  // makes even round lesions read as high-border. Smooth the mask first —
  // a genuinely irregular border survives a 3×3 blur, single-pixel jaggies
  // do not. Correction 1.12 is calibrated on synthetic disks so a clean
  // circle yields circularity ≈ 1 (radius-invariant across r=30..100).
  const maskS = smoothMask(mask, w, h);
  let areaS = 0, perimeter = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!maskS[y * w + x]) continue;
      areaS++;
      const edge =
        x === 0 || y === 0 || x === w - 1 || y === h - 1 ||
        !maskS[y * w + (x - 1)] || !maskS[y * w + (x + 1)] ||
        !maskS[(y - 1) * w + x] || !maskS[(y + 1) * w + x];
      if (edge) perimeter++;
    }
  }
  const perimCorr = perimeter * 1.12; // clean disk → circularity ≈ 1
  const circularity =
    perimeter > 0 ? clamp01((4 * Math.PI * areaS) / (perimCorr * perimCorr)) : 1;
  const border = clamp01(1 - circularity);

  // ── 3. Asymmetry: fold in principal-axis coords, measure non-overlap ──
  const cos = Math.cos(-theta), sin = Math.sin(-theta);
  // Hash of occupied (u,v) cells in rotated frame (rounded to 1px).
  const occ = new Set<number>();
  const BIAS = 1024; // keep keys positive & unique
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] <= THRESH) continue;
      const dx = x - cx, dy = y - cy;
      const u = Math.round(dx * cos - dy * sin);
      const v = Math.round(dx * sin + dy * cos);
      occ.add((u + BIAS) * (BIAS * 4) + (v + BIAS));
    }
  }
  const key = (u: number, v: number) => (u + BIAS) * (BIAS * 4) + (v + BIAS);
  let missMajor = 0, missMinor = 0;
  occ.forEach((k) => {
    const u = Math.floor(k / (BIAS * 4)) - BIAS;
    const v = (k % (BIAS * 4)) - BIAS;
    if (!occ.has(key(u, -v))) missMajor++; // reflect across major axis (v→−v)
    if (!occ.has(key(-u, v))) missMinor++; // reflect across minor axis (u→−u)
  });
  const asymmetry = clamp01((missMajor + missMinor) / (2 * area));

  // ── 4. Color: count distinct clinical colors inside the mask ──
  const bins = new Array(CLINICAL_COLORS.length).fill(0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] <= THRESH) continue;
      const i = (y * w + x) * 3;
      bins[nearestClinicalColor(rgb[i], rgb[i + 1], rgb[i + 2])]++;
    }
  }
  let colorCount = 0;
  for (const b of bins) if (b / area >= COLOR_MIN_SHARE) colorCount++;
  colorCount = Math.max(1, colorCount);
  const color = clamp01((colorCount - 1) / 5); // 1 color → 0, 6 colors → 1

  // ── 5. Diameter: major-axis length relative to frame diagonal ──
  // Equivalent-ellipse major axis = 4·sqrt(λmax).
  const majorAxis = 4 * Math.sqrt(Math.max(lambdaMax, 0));
  void lambdaMin;
  const diag = Math.sqrt(w * w + h * h);
  const majorAxisFrac = clamp01(majorAxis / diag);
  // A lesion filling ~half the (already lesion-cropped) frame is "large".
  const diameter = clamp01(majorAxisFrac / 0.7);

  return {
    asymmetry, border, color, diameter,
    raw: {
      area,
      coverage: area / (w * h),
      perimeter: perimCorr,
      circularity,
      colorCount,
      majorAxisFrac,
      orientationRad: theta,
    },
  };
}

// ── Clinical color palette (approx. of the 6 ABCD colors) ──
const CLINICAL_COLORS: [number, number, number][] = [
  [245, 235, 225], // white / light
  [190, 60, 60],   // red
  [200, 150, 110], // light brown
  [110, 70, 45],   // dark brown
  [70, 80, 110],   // blue-gray
  [30, 25, 25],    // black
];

function nearestClinicalColor(r: number, g: number, b: number): number {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < CLINICAL_COLORS.length; i++) {
    const [cr, cg, cb] = CLINICAL_COLORS[i];
    const d = (r - cr) * (r - cr) + (g - cg) * (g - cg) + (b - cb) * (b - cb);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isFinite(v) ? v : 0;
}

/**
 * Separable 3×3 box blur of the binarized mask, re-thresholded at 0.5.
 * Strips single-pixel contour noise (which inflates the perimeter and thus
 * the Border score) while leaving genuine irregularity intact. Accepts a
 * sigmoid [0,1] or binary mask; returns a {0,1} Uint8Array. Edges clamp.
 */
function smoothMask(mask: ArrayLike<number>, w: number, h: number): Uint8Array {
  const tmp = new Float32Array(w * h);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) {
        const xx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
        s += mask[y * w + xx] > THRESH ? 1 : 0;
      }
      tmp[y * w + x] = s / 3;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let k = -1; k <= 1; k++) {
        const yy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
        s += tmp[yy * w + x];
      }
      out[y * w + x] = s / 3 >= 0.5 ? 1 : 0;
    }
  }
  return out;
}
