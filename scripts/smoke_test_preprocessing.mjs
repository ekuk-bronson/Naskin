// scripts/smoke_test_preprocessing.mjs
//
// Standalone smoke test that exercises every pure-JS function from
// services/preprocessing.ts on synthetic inputs. No React Native, no
// Metro — just Node. Run with:  node scripts/smoke_test_preprocessing.mjs
//
// Goal: prove the pipeline's pure logic compiles to working code, produces
// the expected output shapes, and handles edge cases. This does NOT prove
// the model is correct or that on-device perf matches; it proves the JS
// math is sane.

import { strict as assert } from 'node:assert';

// ─── Direct ports of preprocessing.ts pure functions ─────────────────────────

function rgbToGrey(rgb, w, h) {
  const out = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < rgb.length; i += 3, j++) {
    out[j] = (rgb[i] * 0.299 + rgb[i + 1] * 0.587 + rgb[i + 2] * 0.114) | 0;
  }
  return out;
}

function laplacianVariance(grey, w, h) {
  let sum = 0, sumSq = 0, count = 0;
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    for (let x = 1; x < w - 1; x++) {
      const i = row + x;
      const v = grey[i - w] + grey[i + w] + grey[i - 1] + grey[i + 1] - 4 * grey[i];
      sum += v; sumSq += v * v; count++;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

function meanStd(buf) {
  let sum = 0, sumSq = 0;
  for (let i = 0; i < buf.length; i++) { sum += buf[i]; sumSq += buf[i] * buf[i]; }
  const mean = sum / buf.length;
  const variance = sumSq / buf.length - mean * mean;
  return { mean, std: Math.sqrt(Math.max(0, variance)) };
}

function checkInputValid(rgb, w, h) {
  if (w < 200 || h < 200) return { valid: false, reason: 'quality.tooSmall' };
  const n = (rgb.length / 3) | 0;
  if (n === 0) return { valid: false, reason: 'quality.tooSmall' };
  let sumBright = 0, skinCount = 0;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
    sumBright += (r + g + b) / 3;
    if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) skinCount++;
  }
  const brightness = sumBright / n;
  if (brightness < 40) return { valid: false, reason: 'quality.dark' };
  if (brightness > 230) return { valid: false, reason: 'quality.bright' };
  if (skinCount / n < 0.25) return { valid: false, reason: 'quality.noSkin' };
  return { valid: true };
}

function otsuThreshold(grey) {
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
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; threshold = t; }
  }
  return threshold;
}

function shadesOfGray(rgb, w, h, p = 6) {
  const n = w * h;
  let sR = 0, sG = 0, sB = 0;
  if (p === 6) {
    for (let i = 0; i < rgb.length; i += 3) {
      const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
      const r2 = r * r, g2 = g * g, b2 = b * b;
      sR += r2 * r2 * r2; sG += g2 * g2 * g2; sB += b2 * b2 * b2;
    }
  } else {
    for (let i = 0; i < rgb.length; i += 3) {
      sR += Math.pow(rgb[i], p); sG += Math.pow(rgb[i + 1], p); sB += Math.pow(rgb[i + 2], p);
    }
  }
  const invP = 1 / p;
  const nR = Math.pow(sR / n, invP);
  const nG = Math.pow(sG / n, invP);
  const nB = Math.pow(sB / n, invP);
  const gray = (nR + nG + nB) / 3;
  const sR2 = gray / (nR + 1e-6), sG2 = gray / (nG + 1e-6), sB2 = gray / (nB + 1e-6);
  const out = new Uint8ClampedArray(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    out[i]     = Math.min(255, Math.max(0, (rgb[i]     * sR2) | 0));
    out[i + 1] = Math.min(255, Math.max(0, (rgb[i + 1] * sG2) | 0));
    out[i + 2] = Math.min(255, Math.max(0, (rgb[i + 2] * sB2) | 0));
  }
  return out;
}

function resizeBilinear(src, sw, sh, size) {
  const out = new Uint8ClampedArray(size * size * 3);
  const scaleX = sw / size, scaleY = sh / size;
  for (let y = 0; y < size; y++) {
    const fy = (y + 0.5) * scaleY - 0.5;
    let y0 = Math.floor(fy), y1 = y0 + 1;
    if (y0 < 0) y0 = 0; if (y1 < 0) y1 = 0;
    if (y0 >= sh) y0 = sh - 1; if (y1 >= sh) y1 = sh - 1;
    const wy = fy - Math.floor(fy);
    for (let x = 0; x < size; x++) {
      const fx = (x + 0.5) * scaleX - 0.5;
      let x0 = Math.floor(fx), x1 = x0 + 1;
      if (x0 < 0) x0 = 0; if (x1 < 0) x1 = 0;
      if (x0 >= sw) x0 = sw - 1; if (x1 >= sw) x1 = sw - 1;
      const wx = fx - Math.floor(fx);
      const i00 = (y0 * sw + x0) * 3, i01 = (y0 * sw + x1) * 3;
      const i10 = (y1 * sw + x0) * 3, i11 = (y1 * sw + x1) * 3;
      const w00 = (1 - wx) * (1 - wy), w01 = wx * (1 - wy);
      const w10 = (1 - wx) * wy,       w11 = wx * wy;
      const o = (y * size + x) * 3;
      for (let c = 0; c < 3; c++) {
        out[o + c] = (src[i00 + c] * w00 + src[i01 + c] * w01 + src[i10 + c] * w10 + src[i11 + c] * w11) | 0;
      }
    }
  }
  return out;
}

// ─── Synthetic test fixtures ─────────────────────────────────────────────────

function makeSkinPhoto(w, h) {
  // Warm-tone skin background with a darker brown "mole" in the centre.
  const rgb = new Uint8ClampedArray(w * h * 3);
  const cx = w >> 1, cy = h >> 1, r = Math.min(w, h) * 0.15;
  const r2 = r * r;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const dx = x - cx, dy = y - cy;
      const isMole = dx * dx + dy * dy < r2;
      if (isMole) { rgb[i] = 90; rgb[i + 1] = 60; rgb[i + 2] = 50; }
      else        { rgb[i] = 210; rgb[i + 1] = 175; rgb[i + 2] = 140; }
    }
  }
  return rgb;
}

function makeDarkRoom(w, h) {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = 15;
  return rgb;
}

function makeOverexposed(w, h) {
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = 245;
  return rgb;
}

function makeSky(w, h) {
  // Blue-ish, no skin colour
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 100; rgb[i + 1] = 150; rgb[i + 2] = 220;
  }
  return rgb;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

console.log('FreeSkin preprocessing — JS smoke test\n');

const tests = [];
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); tests.push({ name, ok: true, ms: Date.now() - t0 }); }
  catch (e) { tests.push({ name, ok: false, err: e.message, ms: Date.now() - t0 }); }
}

// 1. Input gate
test('checkInputValid rejects too-small image', () => {
  const rgb = makeSkinPhoto(100, 100);
  const r = checkInputValid(rgb, 100, 100);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'quality.tooSmall');
});

test('checkInputValid rejects dark room', () => {
  const rgb = makeDarkRoom(256, 256);
  const r = checkInputValid(rgb, 256, 256);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'quality.dark');
});

test('checkInputValid rejects over-exposed', () => {
  const rgb = makeOverexposed(256, 256);
  const r = checkInputValid(rgb, 256, 256);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'quality.bright');
});

test('checkInputValid rejects non-skin photo (sky)', () => {
  const rgb = makeSky(256, 256);
  const r = checkInputValid(rgb, 256, 256);
  assert.equal(r.valid, false);
  assert.equal(r.reason, 'quality.noSkin');
});

test('checkInputValid accepts skin photo', () => {
  const rgb = makeSkinPhoto(256, 256);
  const r = checkInputValid(rgb, 256, 256);
  assert.equal(r.valid, true);
});

// 2. Grey conversion
test('rgbToGrey produces values in [0, 255]', () => {
  const rgb = makeSkinPhoto(64, 64);
  const grey = rgbToGrey(rgb, 64, 64);
  assert.equal(grey.length, 64 * 64);
  for (let i = 0; i < grey.length; i++) {
    assert.ok(grey[i] >= 0 && grey[i] <= 255);
  }
});

// 3. Laplacian variance — sharp image has higher variance than smooth
test('laplacianVariance detects sharpness difference', () => {
  // Build a sharp checkerboard vs uniform grey
  const sharp = new Uint8ClampedArray(64 * 64);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++)
    sharp[y * 64 + x] = ((x + y) & 1) ? 255 : 0;
  const flat = new Uint8ClampedArray(64 * 64).fill(128);
  const vSharp = laplacianVariance(sharp, 64, 64);
  const vFlat  = laplacianVariance(flat, 64, 64);
  assert.ok(vSharp > vFlat * 100, `expected sharp >> flat, got ${vSharp} vs ${vFlat}`);
});

// 4. Mean/std
test('meanStd computes correctly', () => {
  const buf = new Uint8ClampedArray([100, 100, 100, 100]);
  const { mean, std } = meanStd(buf);
  assert.equal(mean, 100);
  assert.equal(std, 0);
});

// 5. Otsu threshold separates bimodal distribution
test('otsuThreshold finds bimodal split', () => {
  // Bimodal distribution: 500 pixels at 50, 500 at 200. Otsu picks the
  // first index where the histogram divides cleanly — that's t=50 (all
  // "50"s in class A, all "200"s in class B). Any t in [50, 199] gives
  // the same between-class variance, so the function returns the lowest.
  const grey = new Uint8ClampedArray(1000);
  for (let i = 0; i < 500; i++) grey[i] = 50;
  for (let i = 500; i < 1000; i++) grey[i] = 200;
  const t = otsuThreshold(grey);
  assert.ok(t >= 50 && t < 200, `threshold ${t} should separate 50 from 200`);
});

// 6. Shades of Gray neutralises blue cast
test('shadesOfGray reduces channel imbalance', () => {
  const w = 32, h = 32;
  const rgb = new Uint8ClampedArray(w * h * 3);
  for (let i = 0; i < rgb.length; i += 3) {
    rgb[i] = 80; rgb[i + 1] = 80; rgb[i + 2] = 200;   // blue cast
  }
  const out = shadesOfGray(rgb, w, h);
  // After SoG, channel means should be much closer
  let mR = 0, mG = 0, mB = 0;
  for (let i = 0; i < out.length; i += 3) { mR += out[i]; mG += out[i+1]; mB += out[i+2]; }
  const n = w * h;
  mR /= n; mG /= n; mB /= n;
  const spread = Math.max(mR, mG, mB) - Math.min(mR, mG, mB);
  assert.ok(spread < 80, `expected balanced channels, got spread ${spread.toFixed(1)}`);
});

// 7. Resize to 224
test('resizeBilinear to 224x224 returns correct shape', () => {
  const rgb = makeSkinPhoto(512, 512);
  const out = resizeBilinear(rgb, 512, 512, 224);
  assert.equal(out.length, 224 * 224 * 3);
  // sanity: middle of mole should still be mole-coloured
  const i = (112 * 224 + 112) * 3;
  assert.ok(out[i] < 150, `centre should be dark mole, got R=${out[i]}`);
});

// 8. End-to-end: skin photo passes input gate AND resizes correctly
test('end-to-end: skin photo → resized tensor', () => {
  const rgb = makeSkinPhoto(512, 512);
  const gate = checkInputValid(rgb, 512, 512);
  assert.equal(gate.valid, true);
  const corrected = shadesOfGray(rgb, 512, 512);
  const resized = resizeBilinear(corrected, 512, 512, 224);
  assert.equal(resized.length, 224 * 224 * 3);
  // toModelInput equivalent — convert to Float32 [0, 255], NOT [0, 1]
  const tensor = new Float32Array(resized.length);
  for (let i = 0; i < resized.length; i++) tensor[i] = resized[i];
  // Critical contract: model receives [0, 255] values
  let max = 0; for (let i = 0; i < tensor.length; i++) if (tensor[i] > max) max = tensor[i];
  assert.ok(max > 1.0, 'tensor must NOT be /255-normalised');
  assert.ok(max <= 255, 'tensor must not exceed 255');
});

// ─── Report ──────────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
for (const t of tests) {
  const tag = t.ok ? 'PASS' : 'FAIL';
  const ms  = String(t.ms).padStart(4);
  console.log(`  [${tag}] ${ms}ms  ${t.name}${t.err ? '\n         → ' + t.err : ''}`);
  if (t.ok) passed++; else failed++;
}
console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
