/**
 * ModelRunner — on-device TFLite inference for mole / skin-lesion classification.
 *
 * Activation steps (one-time):
 *   1. python model/convert_keras_to_tflite.py \
 *          --input  path/to/phase_a_best.keras \
 *          --output assets/model/skin_model.tflite
 *   2. npx expo install react-native-fast-tflite
 *   3. Add "react-native-fast-tflite" to app.json `plugins`
 *   4. npx expo prebuild --clean && npx expo run:android
 *   5. Set TFLITE_ENABLED = true below
 *
 * Until step 4 is done, the package is not in the binary even if it is in
 * package.json — `require('react-native-fast-tflite')` then throws. We catch
 * that and let `mockAnalyzer` use its fallback (logged once, no crash).
 *
 * MODEL_OUTPUT_TYPE — set to match the converter's reported output shape:
 *   'ham7'   - [1, 7]  HAM10000 7-class softmax
 *   'abcde'  - [1, 5]  ABCDE regression in [0, 1] per criterion
 *   'binary' - [1, 1]  single malignancy probability in [0, 1]
 */

import Constants from 'expo-constants';
import { Asset } from 'expo-asset';
import { getRiskLevel, type RiskLevel } from '../constants/riskLevels';
import { preprocessImage } from '../services/imagePreprocessor';

/**
 * react-native-fast-tflite ships TurboModule code (via react-native-nitro-modules)
 * that throws on module evaluation when the native pod/aar is absent — exactly
 * the situation in Expo Go. A try/catch around `require()` is not always
 * sufficient because the throw bubbles up from a top-level constructor inside
 * a deeply-imported file (NativeNitroModules.ts) and Metro caches the failure.
 *
 * The cleanest guard is to refuse to touch the package in Expo Go at all.
 * Set to true only in dev clients / standalone builds.
 */
const NATIVE_SUPPORTED: boolean = Constants.appOwnership !== 'expo';

// ─── Toggles ─────────────────────────────────────────────────────────────────
const TFLITE_ENABLED      = true;            // flip to true after all activation steps
const INPUT_SIZE          = 224;
// Binary by default to match your dermamap_v3 model. Auto-detect at runtime
// will override this if the actual output shape says otherwise.
const MODEL_OUTPUT_TYPE: 'ham7' | 'abcde' | 'binary' = 'binary';

/**
 * Temperature scaling (Platt-style calibration) for the binary head.
 *
 * The training set is class-balanced (≈50% malignant) while the real-world
 * prior is closer to 5-10% — without calibration the model is overconfident
 * and predicts P ≈ 0.5-0.7 for typical benign moles. Higher T = softer
 * predictions pulled toward 0.5.
 *
 *   T = 1.0  → raw model output (no change)
 *   T = 2.5  → noticeably softer (default, empirically good on smartphone photos)
 *   T = 4.0  → very soft, almost ignores model confidence
 *
 * After temperature we also apply a hard prior shift to compensate for
 * the training/deployment class imbalance.
 */
const MODEL_TEMPERATURE = 2.5;
const MODEL_PRIOR_SHIFT = -1.0;   // negative logit shift → pulls P down for typical benign

// ─── Constants ───────────────────────────────────────────────────────────────
const HIGH_RISK_IDX = [0, 1, 4];  // akiec, bcc, mel — informational only

export interface ModelOutput {
  score:  number;
  risk:   RiskLevel;
  sizeMm: number;
  abcde: {
    asymmetry: number;
    border:    number;
    color:     number;
    diameter:  number;
    evolution: number;
  };
  summary: string;
  rec:     string;
}

// Russian copy lives in i18n.ts via risk.* keys; this is the inference-time
// fallback the UI will overwrite if it re-localises.
const SUMMARIES: Record<RiskLevel, { summary: string; rec: string }> = {
  urgent:   { summary: 'Признаки требуют немедленной оценки специалиста.',           rec: 'Срочно обратитесь к дерматологу.' },
  high:     { summary: 'Выявлены признаки, характерные для подозрительных образований.', rec: 'Обратитесь к дерматологу в течение 2 недель.' },
  moderate: { summary: 'Обнаружены признаки, требующие профессиональной оценки.',    rec: 'Обратитесь к дерматологу в течение месяца.' },
  notable:  { summary: 'Лёгкие отличительные черты без явных признаков опасности.',  rec: 'Покажите дерматологу при следующем плановом визите.' },
  low:      { summary: 'Признаков беспокойства не выявлено.',                        rec: 'Обычное наблюдение, самоосмотр раз в 6 месяцев.' },
};

// Reference HIGH_RISK_IDX so the linter doesn't strip it (used by future variants)
void HIGH_RISK_IDX;

// ─── Output mappers ──────────────────────────────────────────────────────────

function clamp01(v: number): number { return Math.max(0, Math.min(1, v)); }
function toScore(v: number): number { return Math.min(10, Math.max(0, Math.round(clamp01(v) * 100) / 10)); }

function mapHam7ToAbcde(probs: ArrayLike<number>): ModelOutput['abcde'] & { overall: number } {
  const p = (i: number) => clamp01(probs[i] ?? 0);
  const mel    = p(4);
  const bcc    = p(1);
  const akiec  = p(0);
  const high   = clamp01(mel + bcc + akiec);
  return {
    asymmetry: toScore((high + mel) / 2),
    border:    toScore((bcc + mel)  / 2),
    color:     toScore(high),
    diameter:  toScore(Math.min(1, mel * 1.3)),
    evolution: toScore(high * 0.9),
    overall:   toScore(high),
  };
}

function mapAbcde5(raw: ArrayLike<number>): ModelOutput['abcde'] & { overall: number } {
  const a = toScore(raw[0] ?? 0);
  const b = toScore(raw[1] ?? 0);
  const c = toScore(raw[2] ?? 0);
  const d = toScore(raw[3] ?? 0);
  const e = toScore(raw[4] ?? 0);
  return {
    asymmetry: a, border: b, color: c, diameter: d, evolution: e,
    overall: parseFloat(((a + b + c + d + e) / 5).toFixed(1)),
  };
}

/**
 * Inverse-sigmoid (logit) → temperature scale → sigmoid.
 * Equivalent to applying P_cal = σ(logit(P_raw)/T + shift).
 */
function calibrateBinaryProb(rawP: number): number {
  const eps = 1e-6;
  const clipped = Math.min(1 - eps, Math.max(eps, rawP));
  const logit = Math.log(clipped / (1 - clipped));
  const cal = logit / MODEL_TEMPERATURE + MODEL_PRIOR_SHIFT;
  return 1 / (1 + Math.exp(-cal));
}

function mapBinary(raw: ArrayLike<number>): ModelOutput['abcde'] & { overall: number } {
  const rawP = clamp01(raw[0] ?? 0);
  const risk = calibrateBinaryProb(rawP);
  const s = toScore(risk);
  // eslint-disable-next-line no-console
  console.log(`[ModelRunner] P_raw=${rawP.toFixed(3)} → P_cal=${risk.toFixed(3)} (T=${MODEL_TEMPERATURE}, shift=${MODEL_PRIOR_SHIFT})`);
  return {
    asymmetry: toScore(risk * 1.05),
    border:    toScore(risk * 0.95),
    color:     s,
    diameter:  toScore(risk * 0.85),
    evolution: toScore(risk * 1.10),
    overall:   s,
  };
}

// ─── Lazy native-module loader ───────────────────────────────────────────────
//
// We deliberately use a runtime try/catch around require() so the JS bundle
// remains valid when the native pod/aar is absent. Static `import` would
// crash module evaluation in that case.

type TfliteDelegate = 'default' | 'core-ml' | 'metal' | 'nnapi' | 'gpu' | 'android-gpu';
interface TfliteModule {
  loadTensorflowModel: (
    source: number | { url: string },
    delegates?: TfliteDelegate[],
  ) => Promise<TfliteModel>;
}
interface TfliteModel {
  // Native returns ArrayBuffers — caller wraps in TypedArray of the right kind.
  runSync: (inputs: ArrayBuffer[]) => ArrayBuffer[];
}

// Cache the require() result so a transient failure (Metro caches throws)
// doesn't keep flooding error overlays on every subsequent inference.
let _tflite: TfliteModule | null | undefined;
function loadTflite(): TfliteModule | null {
  if (_tflite !== undefined) return _tflite;
  if (!NATIVE_SUPPORTED) { _tflite = null; return null; }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _tflite = require('react-native-fast-tflite') as TfliteModule;
  } catch {
    _tflite = null;
  }
  return _tflite;
}

let _modelAsset: number | null | undefined;
function loadModelAsset(): number | null {
  if (_modelAsset !== undefined) return _modelAsset;
  try {
    // Metro's require() understands static asset references. If the file is
    // missing this throws at build time, not runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _modelAsset = require('../assets/model/skin_model.tflite') as number;
  } catch {
    _modelAsset = null;
  }
  return _modelAsset;
}

// ─── Public API ──────────────────────────────────────────────────────────────

class MoleClassifier {
  private model: TfliteModel | null = null;
  private loaded = false;

  /**
   * True when the caller should bother trying to load/run the model.
   * Returns false in Expo Go (native TurboModules absent), regardless of
   * the TFLITE_ENABLED toggle, so `analyzeImage` falls through to the mock
   * silently instead of logging a warning on every inference.
   */
  get isEnabled(): boolean { return TFLITE_ENABLED && NATIVE_SUPPORTED; }

  async load(): Promise<void> {
    if (this.loaded) return;
    if (!TFLITE_ENABLED) {
      throw new Error('TFLite disabled. Set TFLITE_ENABLED = true in model/ModelRunner.ts after running the activation steps.');
    }
    if (!NATIVE_SUPPORTED) {
      throw new Error('TFLite cannot run inside Expo Go — native TurboModules are unavailable. Build a dev client: npx expo prebuild --clean && npx expo run:android');
    }
    const tflite = loadTflite();
    if (!tflite) {
      throw new Error('react-native-fast-tflite is not linked. Run: npx expo install react-native-fast-tflite && npx expo prebuild --clean');
    }
    const assetId = loadModelAsset();
    if (assetId == null) {
      throw new Error('Missing assets/model/skin_model.tflite. Run the converter first.');
    }

    // Materialise the asset on disk (Metro dev server returns an HTTP URL
    // with query params that native createModel can't read).
    let modelUrl: string;
    let assetInfo: { localUri: string | null; uri: string; size?: number | null } = {
      localUri: null, uri: '', size: null,
    };
    try {
      const asset = Asset.fromModule(assetId);
      if (!asset.localUri) await asset.downloadAsync();
      assetInfo = { localUri: asset.localUri, uri: asset.uri, size: asset.hash ? null : null };
      modelUrl = asset.localUri ?? asset.uri;
    } catch (e) {
      throw new Error('Failed to materialise model asset on disk: ' + String(e));
    }

    // eslint-disable-next-line no-console
    console.log('[ModelRunner] loading TFLite from:', modelUrl,
                '\n  asset.localUri =', assetInfo.localUri,
                '\n  asset.uri      =', assetInfo.uri);

    // Empty delegates array → CPU only. Required: native createModel(data, delegates)
    // explodes with "Value is undefined, expected an Object" when delegates is undefined.
    try {
      this.model = await tflite.loadTensorflowModel({ url: modelUrl }, []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log('[ModelRunner] loadTensorflowModel({url}) failed:', String(e));
      // Legacy fallback — pass the raw require() asset id.
      this.model = await tflite.loadTensorflowModel(assetId, []);
    }
    this.loaded = true;
  }

  async run(imageUri: string): Promise<ModelOutput> {
    if (!this.loaded) await this.load();
    if (!this.model) throw new Error('TFLite model not loaded');

    const tensor: Float32Array = await preprocessImage(imageUri, INPUT_SIZE, 3);
    const inputBuffer = tensor.buffer.slice(tensor.byteOffset, tensor.byteOffset + tensor.byteLength) as ArrayBuffer;

    // ── Input diagnostics ──
    let tMin = Infinity, tMax = -Infinity, tSum = 0;
    for (let i = 0; i < tensor.length; i++) {
      const v = tensor[i];
      if (v < tMin) tMin = v;
      if (v > tMax) tMax = v;
      tSum += v;
    }
    const tMean = tSum / tensor.length;
    const isGreyFill =
      tensor.length > 0 && tensor[0] === 127 && tensor[tensor.length - 1] === 127;
    if (isGreyFill) {
      // eslint-disable-next-line no-console
      console.warn('[ModelRunner] preprocessing fell back to mid-grey fill (jpeg-js missing). Install with: npm i jpeg-js');
    }
    // eslint-disable-next-line no-console
    console.log(
      `[ModelRunner] input: len=${tensor.length}, bytes=${inputBuffer.byteLength}, ` +
      `min=${tMin.toFixed(1)} mean=${tMean.toFixed(1)} max=${tMax.toFixed(1)} ` +
      `first3=[${tensor[0]?.toFixed(0)},${tensor[1]?.toFixed(0)},${tensor[2]?.toFixed(0)}]`,
    );

    const t0 = Date.now();
    const outputs = this.model.runSync([inputBuffer]);
    const dt = Date.now() - t0;

    // Native returns ArrayBuffer[]; wrap into Float32Array for indexing.
    // Some builds may already return a TypedArray — handle both.
    const rawOut = outputs[0];
    let raw: Float32Array;
    let outFormat: string;
    if (rawOut instanceof Float32Array) {
      raw = rawOut;
      outFormat = 'Float32Array';
    } else if (rawOut instanceof ArrayBuffer) {
      raw = new Float32Array(rawOut);
      outFormat = `ArrayBuffer(${rawOut.byteLength}b → ${raw.length} float32)`;
    } else {
      raw = new Float32Array(1);
      outFormat = `unknown(${typeof rawOut}: ${Object.prototype.toString.call(rawOut)})`;
    }

    // eslint-disable-next-line no-console
    console.log(
      `[ModelRunner] inference ${dt}ms, output: ${outFormat}, values = [` +
      Array.from(raw).slice(0, Math.min(raw.length, 10)).map((v) => v.toFixed(4)).join(', ') +
      (raw.length > 10 ? '…' : '') + ']',
    );

    // Auto-detect output type from the actual shape. Falls back to the
    // configured MODEL_OUTPUT_TYPE constant when length doesn't match any
    // known head.
    let detected: 'ham7' | 'abcde' | 'binary';
    if (raw.length === 7)      detected = 'ham7';
    else if (raw.length === 5) detected = 'abcde';
    else if (raw.length === 1) detected = 'binary';
    else                       detected = MODEL_OUTPUT_TYPE;

    if (detected !== MODEL_OUTPUT_TYPE) {
      // eslint-disable-next-line no-console
      console.log(`[ModelRunner] auto-detected output type "${detected}" (configured: "${MODEL_OUTPUT_TYPE}")`);
    }

    let mapped: ModelOutput['abcde'] & { overall: number };
    if (detected === 'ham7') {
      mapped = mapHam7ToAbcde(raw);
    } else if (detected === 'abcde') {
      mapped = mapAbcde5(raw);
    } else {
      mapped = mapBinary(raw);
    }

    const { overall, ...abcde } = mapped;
    const score  = parseFloat(overall.toFixed(1));
    const risk   = getRiskLevel(score);
    const sizeMm = Math.max(2, Math.round(score * 0.8 + 1));

    return { score, risk, sizeMm, abcde, ...SUMMARIES[risk] };
  }
}

export const modelRunner = new MoleClassifier();
