/**
 * PDF report export for FreeSkin.
 *
 * Requires (run once before using):
 *   npx expo install expo-print expo-sharing
 *
 * Falls back gracefully when packages are not installed.
 */
import type { Mole } from './storage';
import { getSetting } from './storage';
import { RISK_LEVELS, MEDICAL_DISCLAIMER } from '../constants/riskLevels';
import { t } from './i18n';

// HTML helpers — никаких числовых score в выводе для пользователя
function recBlock(rec: string, color: string): string {
  return `
    <div style="margin-top:8px;padding:8px 10px;background:${color}10;border-left:3px solid ${color};border-radius:6px;font-size:11px;color:${color};font-weight:600">
      ${rec}
    </div>`;
}

function moleSection(m: Mole): string {
  const cfg   = RISK_LEVELS[m.risk] ?? RISK_LEVELS.low;
  const color = cfg.color;
  return `
  <div style="background:#fff;border:1px solid #EDE9E3;border-radius:16px;padding:16px;margin-bottom:12px;page-break-inside:avoid">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
      <div>
        <div style="font-size:15px;font-weight:800;color:#1C1A18;letter-spacing:-0.3px">${m.name}</div>
        <div style="font-size:11px;color:#9A9087;margin-top:3px">${m.loc ?? '—'} · ${m.size ?? '—'} · с ${m.since ?? '—'}</div>
      </div>
      <div style="text-align:right">
        <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:99px;background:${color}15;border:1px solid ${color}40">
          <div style="width:8px;height:8px;border-radius:99px;background:${color}"></div>
          <span style="font-size:11px;font-weight:800;color:${color};letter-spacing:0.2px">${t(`risk.${m.risk}.label`)}</span>
        </div>
      </div>
    </div>
    <div style="margin-top:8px;font-size:11px;color:#9A9087;line-height:1.6">${t(`risk.${m.risk}.summary`)}</div>
    ${recBlock(t(`risk.${m.risk}.rec`), color)}
  </div>`;
}

// ── Main HTML builder ─────────────────────────────────────────────────────────
function buildHtml(moles: Mole[], userName: string): string {
  const now        = new Date();
  const dateStr    = now.toLocaleString('ru', { day: 'numeric', month: 'long', year: 'numeric' });
  const age        = getSetting('user_age')    ?? '';
  const gender     = getSetting('user_gender') ?? '';
  const skinType   = getSetting('user_skin')   ?? '';

  const genderLabel   = gender === 'female' ? 'Женский' : gender === 'male' ? 'Мужской' : '';
  const skinLabel     = skinType === 'light' ? 'Светлая (I–II)' : skinType === 'medium' ? 'Средняя (III–IV)' : skinType === 'dark' ? 'Тёмная (V–VI)' : '';

  const high     = moles.filter((m) => m.risk === 'high' || m.risk === 'urgent');
  const moderate = moles.filter((m) => m.risk === 'moderate');
  const low      = moles.filter((m) => m.risk === 'low' || m.risk === 'notable');

  const profilePills = [
    age        ? `<span style="padding:3px 10px;border:1px solid #EDE9E3;border-radius:99px;font-size:10px;color:#9A9087">${age} лет</span>` : '',
    genderLabel ? `<span style="padding:3px 10px;border:1px solid #EDE9E3;border-radius:99px;font-size:10px;color:#9A9087">${genderLabel}</span>` : '',
    skinLabel   ? `<span style="padding:3px 10px;border:1px solid #EDE9E3;border-radius:99px;font-size:10px;color:#9A9087">${skinLabel}</span>` : '',
  ].filter(Boolean).join('');

  const highSection = high.length > 0 ? `
  <div style="background:#FFF5F7;border:1px solid #F0D8DC;border-radius:16px;padding:16px;margin-bottom:16px">
    <div style="font-size:11px;font-weight:700;color:#E8003D;margin-bottom:10px">${t('pdf.alertHigh')}</div>
    ${high.map((m) => `
    <div style="margin-bottom:8px">
      <div style="font-size:12px;font-weight:600;color:#1C1A18">${m.name}</div>
      <div style="font-size:11px;color:#9A9087;margin-top:2px">${t(`risk.${m.risk}.rec`)}</div>
    </div>`).join('')}
  </div>` : '';

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>FreeSkin — Отчёт дерматоскрининга</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#F8F6F3;margin:0;padding:24px;color:#1C1A18">

  <!-- Header -->
  <div style="background:#1C1A18;border-radius:20px;padding:22px 24px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center">
    <div>
      <div style="font-size:22px;font-weight:800;color:#F0EDE8;letter-spacing:-0.8px">FreeSkin</div>
      <div style="font-size:9px;font-weight:600;color:#8B7355;letter-spacing:2px;text-transform:uppercase;margin-top:4px">AI · Дерматоскрининг</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#F0EDE8;font-weight:600">${dateStr}</div>
      <div style="font-size:9px;color:#5A5248;margin-top:3px;letter-spacing:0.4px">Дата формирования отчёта</div>
    </div>
  </div>

  <!-- Patient card -->
  <div style="background:#fff;border:1px solid #EDE9E3;border-radius:16px;padding:18px;margin-bottom:16px">
    <div style="font-size:9px;font-weight:600;color:#C5BDB4;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px">ПАЦИЕНТ</div>
    <div style="font-size:16px;font-weight:700;color:#1C1A18;margin-bottom:6px">${userName}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${profilePills}</div>
  </div>

  <!-- Stats -->
  <div style="background:#fff;border:1px solid #EDE9E3;border-radius:16px;padding:18px;margin-bottom:16px;display:flex;justify-content:space-around;text-align:center">
    <div>
      <div style="font-size:28px;font-weight:800;color:#1C1A18;letter-spacing:-1px">${moles.length}</div>
      <div style="font-size:9px;color:#C5BDB4;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px">Всего</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:800;color:#00904A;letter-spacing:-1px">${low.length}</div>
      <div style="font-size:9px;color:#C5BDB4;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px">Норма</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:800;color:${high.length > 0 ? '#E8003D' : '#00904A'};letter-spacing:-1px">${high.length}</div>
      <div style="font-size:9px;color:#C5BDB4;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px">Высокий риск</div>
    </div>
    <div>
      <div style="font-size:28px;font-weight:800;color:#E06000;letter-spacing:-1px">${moderate.length}</div>
      <div style="font-size:9px;color:#C5BDB4;text-transform:uppercase;letter-spacing:0.8px;margin-top:4px">Наблюдение</div>
    </div>
  </div>

  ${highSection}

  <!-- Moles -->
  <div style="font-size:9px;font-weight:600;color:#C5BDB4;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;margin-left:2px">РЕЗУЛЬТАТЫ АНАЛИЗА · ${moles.length}</div>
  ${moles.map(moleSection).join('')}

  <!-- Disclaimer -->
  <div style="border-top:1px solid #EDE9E3;margin-top:24px;padding-top:16px">
    <div style="font-size:11px;color:#9A9087;line-height:1.6;text-align:center;font-weight:600">
      ${t('disclaimer')}
    </div>
    <div style="font-size:10px;color:#C5BDB4;line-height:1.6;text-align:center;margin-top:8px">
      Все данные хранятся исключительно на устройстве пользователя и не передаются третьим лицам.<br/>
      v0.1.0 · ${now.getFullYear()}
    </div>
  </div>

</body>
</html>`;
}

// ── Public export function ────────────────────────────────────────────────────
export async function exportToPdf(moles: Mole[], userName: string): Promise<'ok' | 'not_installed' | 'error'> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Print = require('expo-print');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sharing = require('expo-sharing');

    const html = buildHtml(moles, userName);
    const { uri } = await Print.printToFileAsync({ html, base64: false });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Сохранить отчёт FreeSkin',
        UTI: 'com.adobe.pdf',
      });
    }
    return 'ok';
  } catch (err: any) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' || String(err).includes('Cannot find module')) {
      return 'not_installed';
    }
    console.warn('[pdfExport]', err);
    return 'error';
  }
}
