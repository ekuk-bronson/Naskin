/**
 * 5-уровневая шкала риска меланомы.
 *
 * Пороги по вероятности P (бинарной модели benign/malignant), умноженной на 10:
 *
 *   P < 0.20  →  low      (very_low)  — спокойное наблюдение
 *   0.20–0.40 →  notable  (low)        — показать дерматологу при следующем визите
 *   0.40–0.65 →  moderate              — дерматолог в течение месяца
 *   0.65–0.85 →  high                  — дерматолог в течение 2 недель
 *   P > 0.85  →  urgent                — срочно к дерматологу
 *
 * ВАЖНО: число P / score пользователю НЕ показывается. Только категория.
 */

export type RiskLevel = 'low' | 'notable' | 'moderate' | 'high' | 'urgent';

export interface RiskConfig {
  opacity: number;
  weight: '800' | '700' | '600';
  label:    string;   // полная подпись на hero
  short:    string;   // короткое слово (для чипов/badge)
  rec:      string;   // короткая рекомендация (одна строка)
  threshold: number;  // нижняя граница score (0–10)
  color:       string;
  colorDim:    string;
  colorBg:     string;
  colorBorder: string;
  glow:        string;
}

export const RISK_LEVELS: Record<RiskLevel, RiskConfig> = {
  low: {
    opacity: 0.35, weight: '600',
    label:  'Низкий риск',
    short:  'Низкий',
    rec:    'Обычное наблюдение. Самоосмотр раз в 6 месяцев.',
    threshold: 0,
    color:       '#00904A',
    colorDim:    'rgba(0,144,74,0.5)',
    colorBg:     '#F0FFF6',
    colorBorder: '#A0E8C0',
    glow:        'rgba(0,144,74,0.08)',
  },
  notable: {
    opacity: 0.5, weight: '600',
    label:  'Низкий риск',
    short:  'Внимание',
    rec:    'Покажите дерматологу при следующем плановом визите.',
    threshold: 2.0,
    color:       '#7B8B1F',
    colorDim:    'rgba(123,139,31,0.5)',
    colorBg:     '#F8F7E8',
    colorBorder: '#D8D6A0',
    glow:        'rgba(123,139,31,0.1)',
  },
  moderate: {
    opacity: 0.65, weight: '700',
    label:  'Умеренный риск',
    short:  'Умеренный',
    rec:    'Обратитесь к дерматологу в течение месяца.',
    threshold: 4.0,
    color:       '#E06000',
    colorDim:    'rgba(224,96,0,0.5)',
    colorBg:     '#FFF8F0',
    colorBorder: '#FFD8A8',
    glow:        'rgba(224,96,0,0.1)',
  },
  high: {
    opacity: 0.85, weight: '700',
    label:  'Высокий риск',
    short:  'Высокий',
    rec:    'Обратитесь к дерматологу в течение 2 недель.',
    threshold: 6.5,
    color:       '#D03020',
    colorDim:    'rgba(208,48,32,0.5)',
    colorBg:     '#FFF0EE',
    colorBorder: '#FFC0B8',
    glow:        'rgba(208,48,32,0.12)',
  },
  urgent: {
    opacity: 1.0, weight: '800',
    label:  'Срочно к врачу',
    short:  'Срочно',
    rec:    'Срочно обратитесь к дерматологу.',
    threshold: 8.5,
    color:       '#E8003D',
    colorDim:    'rgba(232,0,61,0.5)',
    colorBg:     '#FFEDF1',
    colorBorder: '#FFB8C8',
    glow:        'rgba(232,0,61,0.18)',
  },
};

/**
 * Convert score 0–10 (P × 10) → risk category.
 * Thresholds (per project spec):
 *   P >= 0.85 → urgent
 *   P >= 0.65 → high
 *   P >= 0.40 → moderate
 *   P >= 0.20 → notable
 *   P <  0.20 → low
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= 8.5) return 'urgent';
  if (score >= 6.5) return 'high';
  if (score >= 4.0) return 'moderate';
  if (score >= 2.0) return 'notable';
  return 'low';
}

/** Цвет, соответствующий score (для индикаторов/графиков). */
export function scoreColor(s: number): string {
  return RISK_LEVELS[getRiskLevel(s)].color;
}

export function scoreOpacity(s: number): number {
  return RISK_LEVELS[getRiskLevel(s)].opacity;
}

/** Уровень считается «требующим действия» (для уведомлений и баннеров). */
export function isActionable(level: RiskLevel): boolean {
  return level === 'moderate' || level === 'high' || level === 'urgent';
}

/** Уровень требует срочного отклика (red-flag для уведомлений). */
export function isUrgent(level: RiskLevel): boolean {
  return level === 'high' || level === 'urgent';
}

export const ABCDE_LABELS: Record<string, string> = {
  asymmetry: 'A · Асимметрия',
  border:    'B · Границы',
  color:     'C · Цвет',
  diameter:  'D · Диаметр',
  evolution: 'E · Изменение',
};

/**
 * Обязательный медицинский дисклеймер.
 * Backwards-compatible string export for code that has not been migrated to i18n.
 * For locale-aware UI prefer `t('disclaimer')` from `services/i18n`.
 */
export const MEDICAL_DISCLAIMER =
  'Это не диагноз. FreeSkin не является медицинским устройством. Обратитесь к врачу.';
