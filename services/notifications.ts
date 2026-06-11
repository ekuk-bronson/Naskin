/**
 * notifications.ts
 *
 * expo-notifications is NOT usable in Expo Go on SDK 53+:
 * DevicePushTokenAutoRegistration.fx.js calls addPushTokenListener as a
 * side-effect on every require(), which triggers console.error → red overlay.
 *
 * Fix: check Constants.appOwnership !== 'expo' before ever requiring the
 * package.  In Expo Go every exported function becomes a silent no-op.
 * In a dev build or standalone build everything works normally.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { t } from './i18n';

/** true in dev-build / standalone, false in Expo Go */
const NOTIF_SUPPORTED: boolean = Constants.appOwnership !== 'expo';

/** Lazy-load expo-notifications — only when not in Expo Go. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function N(): any {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-notifications');
}

// ── Lazy init — called once from _layout.tsx after mount ─────────────────────
let handlerSet = false;
export function initNotificationHandler(): void {
  if (!NOTIF_SUPPORTED || handlerSet) return;
  handlerSet = true;
  try {
    N().setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert:  true,
        shouldPlaySound:  false,
        shouldSetBadge:   false,
        shouldShowBanner: true,
        shouldShowList:   true,
      }),
    });
  } catch {
    // Ignore if native module unavailable
  }
}

export const REMINDER_IDENTIFIER = 'freeskin-periodic-reminder';

export async function requestPermissions(): Promise<boolean> {
  if (!NOTIF_SUPPORTED) return false;
  try {
    if (!Device.isDevice) return false;
    const Notifications = N();
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Schedule a repeating reminder every `intervalDays` days.
 * Cancels any previous periodic reminder first.
 */
export async function scheduleReminder(intervalDays: number): Promise<void> {
  if (!NOTIF_SUPPORTED) return;
  try {
    await cancelReminder();
    const Notifications = N();
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_IDENTIFIER,
      content: {
        title: t('notif.title'),
        body:  t('notif.body').replace('{days}', String(intervalDays)),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60 * 60 * 24 * intervalDays,
        repeats: true,
      },
    });
  } catch {
    // Ignore scheduling errors on unsupported environments
  }
}

/** Cancel the periodic reminder. */
export async function cancelReminder(): Promise<void> {
  if (!NOTIF_SUPPORTED) return;
  try {
    await N().cancelScheduledNotificationAsync(REMINDER_IDENTIFIER);
  } catch {
    // Already cancelled or not found
  }
}

/** Returns approximate next reminder date, or null if none scheduled. */
export async function getNextReminderDate(): Promise<Date | null> {
  if (!NOTIF_SUPPORTED) return null;
  try {
    const all = await N().getAllScheduledNotificationsAsync();
    const found = all.find((n: any) => n.identifier === REMINDER_IDENTIFIER);
    if (!found) return null;
    const secs: number = (found.trigger as any)?.seconds ?? 0;
    return secs > 0 ? new Date(Date.now() + secs * 1000) : null;
  } catch {
    return null;
  }
}

/** Build the stable identifier used for a per-mole high-risk reminder. */
export function highRiskReminderIdentifier(moleId: number): string {
  return `freeskin-highrisk-${moleId}`;
}

/**
 * One-off reminder for a specific high-risk mole (fires in 14 days).
 * Uses a stable per-mole identifier so re-scheduling does not accumulate
 * duplicate timers — any previously scheduled reminder for the same
 * `moleId` is cancelled first.
 */
export async function scheduleHighRiskReminder(
  moleId: number,
  moleName: string,
): Promise<void> {
  if (!NOTIF_SUPPORTED) return;
  const identifier = highRiskReminderIdentifier(moleId);
  try {
    const Notifications = N();
    // Cancel any pre-existing reminder for this mole. May throw if the
    // identifier does not exist yet — silently ignored.
    try {
      await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch {
      // No previous reminder — fine.
    }
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: t('notif.highTitle').replace('{name}', moleName),
        body:  t('notif.highBody'),
        data:  { moleId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 60 * 60 * 24 * 14,
        repeats: false,
      },
    });
  } catch {
    // Ignore
  }
}

/** Cancel a high-risk reminder for a specific mole (e.g. on deletion). */
export async function cancelHighRiskReminder(moleId: number): Promise<void> {
  if (!NOTIF_SUPPORTED) return;
  try {
    await N().cancelScheduledNotificationAsync(highRiskReminderIdentifier(moleId));
  } catch {
    // Already cancelled or not found
  }
}
