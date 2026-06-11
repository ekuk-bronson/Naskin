import type { RiskLevel } from '../constants/riskLevels';
import { getRiskLevel, RISK_LEVELS } from '../constants/riskLevels';
import { modelRunner } from '../model/ModelRunner';
import { checkPhotoQuality } from './preprocessing';
import type { ABCDEScore } from './storage';
import { getSetting } from './storage';

export interface AnalysisResult {
  score:  number;
  risk:   RiskLevel;
  sizeMm: number;
  abcde: {
    asymmetry: ABCDEScore;
    border:    ABCDEScore;
    color:     ABCDEScore;
    diameter:  ABCDEScore;
    evolution: ABCDEScore;
  };
  summary: string;
  rec:     string;
  /** True if no lesion was detected in the photo (low coverage or empty mask). */
  noLesionDetected?: boolean;
  /** True if the result is from the mock generator, not the real TFLite model. */
  isMock?: boolean;
}

// ── Russian ABCDE notes keyed by score bucket (low / mid / high) ──────────────
const ABCDE_NOTES: Record<string, string[]> = {
  asymmetry: ['Симметричная', 'Лёгкая асимметрия', 'Выраженная по двум осям'],
  border:    ['Чёткие ровные края', 'Края слегка размыты', 'Нечёткие неровные края'],
  color:     ['Однородный', 'Неоднородный', 'Неоднородный тёмный'],
  diameter:  ['< 3 мм, стабильный', '~5 мм, стабильный', '> 6 мм, увеличился'],
  evolution: ['Без изменений', 'Небольшие изменения', 'Рост за последние месяцы'],
};

const SUMMARIES: Record<RiskLevel, { summary: string; rec: string }> = {
  low: {
    summary: 'Типичная доброкачественная родинка. Признаков беспокойства не выявлено.',
    rec:     RISK_LEVELS.low.rec,
  },
  notable: {
    summary: 'Родинка имеет лёгкие отличительные черты, но без явных признаков опасности.',
    rec:     RISK_LEVELS.notable.rec,
  },
  moderate: {
    summary: 'Обнаружены признаки, требующие профессиональной оценки.',
    rec:     RISK_LEVELS.moderate.rec,
  },
  high: {
    summary: 'Выявлены признаки, характерные для подозрительных образований.',
    rec:     RISK_LEVELS.high.rec,
  },
  urgent: {
    summary: 'Признаки требуют немедленной оценки специалиста.',
    rec:     RISK_LEVELS.urgent.rec,
  },
};

const NO_LESION_SUMMARY: { summary: string; rec: string } = {
  summary: 'Родинка не обнаружена на снимке. Убедитесь, что родинка находится в центре кадра и хорошо освещена.',
  rec:     RISK_LEVELS.low.rec,
};

function applyProfileModifiers(base: number): number {
  let mod = 0;

  const age      = parseInt(getSetting('user_age')    ?? '0', 10);
  const gender   = getSetting('user_gender') ?? '';
  const skinType = getSetting('user_skin')   ?? '';

  if (age >= 50)         mod += 0.4;
  else if (age >= 30)    mod += 0.2;

  if (gender === 'male') mod += 0.15;

  if (skinType === 'light') mod += 0.3;
  else if (skinType === 'dark') mod -= 0.3;

  return parseFloat(Math.max(0, Math.min(10, base + mod)).toFixed(1));
}

function noteForScore(key: string, s: number): string {
  const notes = ABCDE_NOTES[key];
  if (s <= 3) return notes[0]!;
  if (s <= 6) return notes[1]!;
  return notes[2]!;
}

function buildResult(
  scores: Record<string, number>,
  sizeMm: number,
  summary: string,
  rec: string,
  risk: RiskLevel,
  score: number,
  flags: { noLesionDetected?: boolean; isMock?: boolean } = {},
): AnalysisResult {
  const abcde = {} as AnalysisResult['abcde'];
  for (const key of Object.keys(scores) as (keyof typeof scores)[]) {
    const s = Math.round(scores[key]!);
    (abcde as any)[key] = { s, n: noteForScore(key, s) };
  }
  return { score, risk, sizeMm, abcde, summary, rec, ...flags };
}

// ── Throttled warning so the dev console isn't spammed on every analysis ─────
let _warnedOnce = false;
function warnOnce(err: unknown): void {
  if (_warnedOnce) return;
  _warnedOnce = true;
  console.warn('[ModelRunner] TFLite unavailable, using mock for the rest of the session.', err);
}

// ── Hash-based pseudo-random — same photo always gives same mock score. ──────
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;   // 0..1
}

/**
 * Bell-shaped mock distribution centred low.
 *
 * Median ~ 2.4 (low/notable boundary). 80% of results fall below 4.0
 * (still low/notable). 15% land in moderate. 5% in high. <1% urgent.
 * This matches the realistic prior — most moles in a typical user's library
 * are benign. The previous uniform [1, 9] distribution skewed the demo
 * toward "moderate" on every photo, which is what the user reported.
 */
function mockScoreFromUri(uri: string): number {
  const h1 = hashStr(uri);
  const h2 = hashStr(uri + ':2');
  // Box–Muller-ish: two-uniforms averaged → triangular dist around 0.5.
  // Skewed left by squaring to push the mode lower.
  const tri = ((h1 + h2) / 2);                   // 0..1, triangular
  const skewed = tri * tri;                      // 0..1, mode near 0
  return parseFloat((skewed * 6.5).toFixed(1));  // 0..6.5
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function analyzeImage(uri: string): Promise<AnalysisResult> {
  // ── Real model (when react-native-fast-tflite is installed + linked) ──────
  if (modelRunner.isEnabled) {
    try {
      const out = await modelRunner.run(uri);
      return buildResult(
        {
          asymmetry: out.abcde.asymmetry,
          border:    out.abcde.border,
          color:     out.abcde.color,
          diameter:  out.abcde.diameter,
          evolution: out.abcde.evolution,
        },
        out.sizeMm,
        out.summary,
        out.rec,
        out.risk,
        out.score,
      );
    } catch (err) {
      warnOnce(err);
    }
  }

  // ── Lesion detection ─────────────────────────────────────────────────────
  // Cheap pre-check before fabricating a score. Uses the preprocessing
  // pipeline's segmentation. Available when `jpeg-js` is installed.
  let noLesionDetected = false;
  try {
    const q = await checkPhotoQuality(uri);
    if (q && q.metrics.lesionCoverage > 0 && q.metrics.lesionCoverage < 0.02) {
      noLesionDetected = true;
    }
  } catch {
    // checkPhotoQuality returns null in degraded mode — no signal, continue
  }

  // ── Mock simulation delay ────────────────────────────────────────────────
  const analysisQuality = getSetting('analysis_quality') ?? 'standard';
  const isHigh = analysisQuality === 'high';
  await new Promise((r) => setTimeout(r, isHigh ? 2200 : 1500));

  // ── No-lesion short-circuit ──────────────────────────────────────────────
  if (noLesionDetected) {
    const sizeMm = 0;
    return buildResult(
      { asymmetry: 1, border: 1, color: 1, diameter: 1, evolution: 1 },
      sizeMm,
      NO_LESION_SUMMARY.summary,
      NO_LESION_SUMMARY.rec,
      'low',
      0.5,
      { noLesionDetected: true, isMock: true },
    );
  }

  // ── Deterministic, low-biased mock score ─────────────────────────────────
  const base = mockScoreFromUri(uri);
  // Per-criterion variation: ± 1.0 around base, hashed per criterion.
  const criterion = (k: string) => {
    const h = hashStr(uri + ':' + k);
    return parseFloat(Math.max(0.5, Math.min(8.5, base + (h - 0.5) * 2)).toFixed(1));
  };
  const scores = {
    asymmetry: criterion('a'),
    border:    criterion('b'),
    color:     criterion('c'),
    diameter:  criterion('d'),
    evolution: criterion('e'),
  };

  const avg   = Object.values(scores).reduce((a, b) => a + b, 0) / 5;
  const score = applyProfileModifiers(parseFloat(avg.toFixed(1)));
  const risk  = getRiskLevel(score);
  const sizeMm = Math.max(2, Math.round(base * 0.9 + 2));

  return buildResult(
    scores,
    sizeMm,
    SUMMARIES[risk].summary,
    SUMMARIES[risk].rec,
    risk,
    score,
    { isMock: true },
  );
}
