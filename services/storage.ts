import * as SQLite from 'expo-sqlite';
import type { RiskLevel } from '../constants/riskLevels';

// expo-file-system is loaded lazily so unit-test environments (and Expo Go
// with stripped modules) don't blow up on import.
//
// SDK 54 moved the function-style API to /legacy and exposes a new File/Directory
// class API on the root. We use legacy because deletion is a one-shot operation
// that doesn't benefit from the new lifecycle objects, and the legacy import
// silences the deprecation warning.
function fileSystem(): { deleteAsync: (uri: string, opts?: { idempotent?: boolean }) => Promise<void> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-file-system/legacy');
  } catch {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('expo-file-system');
    } catch {
      return null;
    }
  }
}

/**
 * Best-effort delete of a local image file. Safe to call with:
 *   • undefined / null / empty string
 *   • non-file:// URIs (asset bundles, https) — they're skipped
 *   • already-missing files — no-op
 *
 * Never throws — callers can ignore the return value.
 */
async function deleteImageFile(uri: string | null | undefined): Promise<void> {
  if (!uri || typeof uri !== 'string') return;
  if (!uri.startsWith('file://') && !uri.startsWith('/')) return; // skip http/asset/etc
  const fs = fileSystem();
  if (!fs) return;
  try {
    // `idempotent: true` makes deleteAsync a no-op on missing files,
    // so we don't need the (now-deprecated) getInfoAsync pre-check.
    await fs.deleteAsync(uri, { idempotent: true });
  } catch {
    // Swallow — file deletion is a cleanup task, not critical-path.
  }
}

export interface ABCDEScore {
  s: number;
  n: string;
}

export interface MoleHistoryPoint {
  m: string; // month label e.g. "Янв"
  s: number; // score at that point
}

export interface Mole {
  id: number;
  name: string;
  loc: string;
  score: number;
  risk: RiskLevel;
  days: number;    // days since last check
  changed: boolean;
  size: string;    // e.g. "4 мм"
  since: string;   // e.g. "Март 2024"
  imageUri?: string;
  abcde: {
    asymmetry: ABCDEScore;
    border: ABCDEScore;
    color: ABCDEScore;
    diameter: ABCDEScore;
    evolution: ABCDEScore;
  };
  history: MoleHistoryPoint[];
  summary: string;
  rec: string;
}

export const db = SQLite.openDatabaseSync('freeskin.db');

// ── Per-user data isolation ──────────────────────────────────────────
// All read/write operations on `moles` and `settings` are scoped to the
// currently signed-in user. The AuthContext is responsible for setting
// this on sign-in / sign-out / startup.
let currentUserId: string | null = null;

export function setCurrentUserId(id: string | null): void {
  currentUserId = id;
}

export function getCurrentUserId(): string | null {
  return currentUserId;
}

const LEGACY_USER_ID = '__legacy__';

// Eagerly initialize tables when the module is first imported so that
// getSetting() / getAllMoles() etc. work safely during the very first render,
// before any useEffect has had a chance to run.
export function initDb(): void {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS moles (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      name             TEXT    NOT NULL,
      loc              TEXT,
      score            REAL    DEFAULT 0,
      risk             TEXT    DEFAULT 'low',
      days             INTEGER DEFAULT 0,
      changed          INTEGER DEFAULT 0,
      size             TEXT,
      since            TEXT,
      image_uri        TEXT,
      abcde_json       TEXT,
      history_json     TEXT,
      summary          TEXT,
      rec              TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      name       TEXT NOT NULL,
      avatar_url TEXT DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Migration: add last_analyzed_at column for accurate day counter.
  // Silently ignored if the column already exists.
  try { db.execSync(`ALTER TABLE moles ADD COLUMN last_analyzed_at TEXT;`); } catch {}

  // Migration: per-user isolation. Add user_id columns to moles & settings.
  // Both wrapped in try/catch — silently ignored when column already exists.
  try { db.execSync(`ALTER TABLE moles ADD COLUMN user_id TEXT;`); } catch {}
  try { db.execSync(`ALTER TABLE settings ADD COLUMN user_id TEXT;`); } catch {}

  // BACKFILL: assign orphan rows (user_id IS NULL) to the first existing user
  // or fall back to a sentinel '__legacy__' so the records aren't lost.
  try {
    const firstUser = db.getFirstSync<{ id: string }>(
      'SELECT id FROM users LIMIT 1',
    );
    const fallbackId = firstUser?.id ?? LEGACY_USER_ID;
    db.runSync(
      'UPDATE moles    SET user_id = ? WHERE user_id IS NULL',
      [fallbackId],
    );
    db.runSync(
      'UPDATE settings SET user_id = ? WHERE user_id IS NULL',
      [fallbackId],
    );
  } catch {
    // Backfill failure is non-fatal
  }
}
// Run immediately — idempotent (CREATE TABLE IF NOT EXISTS)
initDb();

// The original `settings` table has PRIMARY KEY(key), so to support
// multiple users storing the same logical key we namespace the stored
// row key by user_id ("<userId>::<key>"). The user_id column is also
// kept for explicit filtering.
function namespacedSettingKey(userId: string, key: string): string {
  return `${userId}::${key}`;
}

export function getSetting(key: string): string | null {
  if (!currentUserId) return null;
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ? AND user_id = ?',
    [namespacedSettingKey(currentUserId, key), currentUserId],
  );
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  if (!currentUserId) return;
  db.runSync(
    'INSERT OR REPLACE INTO settings (key, value, user_id) VALUES (?, ?, ?)',
    [namespacedSettingKey(currentUserId, key), value, currentUserId],
  );
}

export function getAllMoles(): Mole[] {
  if (!currentUserId) return [];
  const rows = db.getAllSync<any>(
    'SELECT * FROM moles WHERE user_id = ? ORDER BY score DESC',
    [currentUserId],
  );
  return rows.map(deserializeMole);
}

export function getMole(id: number): Mole | null {
  if (!currentUserId) return null;
  const row = db.getFirstSync<any>(
    'SELECT * FROM moles WHERE id = ? AND user_id = ?',
    [id, currentUserId],
  );
  return row ? deserializeMole(row) : null;
}

export function insertMole(mole: Omit<Mole, 'id'>): number {
  if (!currentUserId) {
    throw new Error('insertMole called without an active user session');
  }
  const result = db.runSync(
    `INSERT INTO moles
       (name, loc, score, risk, days, changed, size, since, image_uri,
        abcde_json, history_json, summary, rec, last_analyzed_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mole.name,
      mole.loc,
      mole.score,
      mole.risk,
      0,
      mole.changed ? 1 : 0,
      mole.size,
      mole.since,
      mole.imageUri ?? null,
      JSON.stringify(mole.abcde),
      JSON.stringify(mole.history),
      mole.summary,
      mole.rec,
      new Date().toISOString(),
      currentUserId,
    ],
  );
  return result.lastInsertRowId;
}

export interface UpdateScoreExtras {
  imageUri?: string;
  summary?: string;
  rec?: string;
}

export function updateMoleScore(
  id: number,
  score: number,
  risk: RiskLevel,
  abcde: Mole['abcde'],
  historyPoint: MoleHistoryPoint,
  extras?: UpdateScoreExtras,
): void {
  const existing = getMole(id);
  if (!existing) return;
  const history = [...existing.history, historyPoint].slice(-12); // keep last 12 months
  if (!currentUserId) return;

  // Re-scan replaces the photo — delete the previous file so /caches doesn't
  // grow unbounded. Skip when the user re-saved the same URI.
  if (
    extras?.imageUri &&
    existing.imageUri &&
    existing.imageUri !== extras.imageUri
  ) {
    void deleteImageFile(existing.imageUri);
  }

  db.runSync(
    `UPDATE moles
     SET score = ?, risk = ?, changed = ?, abcde_json = ?, history_json = ?, days = 0,
         last_analyzed_at = ?,
         image_uri = COALESCE(?, image_uri),
         summary   = COALESCE(?, summary),
         rec       = COALESCE(?, rec)
     WHERE id = ? AND user_id = ?`,
    [
      score,
      risk,
      score > existing.score + 0.5 ? 1 : 0,
      JSON.stringify(abcde),
      JSON.stringify(history),
      new Date().toISOString(),
      extras?.imageUri ?? null,
      extras?.summary  ?? null,
      extras?.rec      ?? null,
      id,
      currentUserId,
    ],
  );
}

export function updateMoleMeta(id: number, name: string, loc: string): void {
  if (!currentUserId) return;
  db.runSync(
    'UPDATE moles SET name = ?, loc = ? WHERE id = ? AND user_id = ?',
    [name, loc, id, currentUserId],
  );
}

/**
 * Delete a mole row and its on-disk photo (best effort).
 * Returns immediately; the file deletion runs in the background.
 */
export function deleteMole(id: number): void {
  if (!currentUserId) return;
  // Capture the photo path BEFORE the row disappears.
  const existing = getMole(id);
  db.runSync(
    'DELETE FROM moles WHERE id = ? AND user_id = ?',
    [id, currentUserId],
  );
  // Fire-and-forget — UI doesn't wait for filesystem cleanup.
  if (existing?.imageUri) {
    void deleteImageFile(existing.imageUri);
  }
}

/**
 * Delete every mole and every photo belonging to the current user.
 * Useful for an "Erase my data" settings action.
 */
export async function deleteAllMolesForCurrentUser(): Promise<number> {
  if (!currentUserId) return 0;
  const rows = db.getAllSync<{ image_uri: string | null }>(
    'SELECT image_uri FROM moles WHERE user_id = ?',
    [currentUserId],
  );
  db.runSync('DELETE FROM moles WHERE user_id = ?', [currentUserId]);
  await Promise.all(rows.map((r) => deleteImageFile(r.image_uri)));
  return rows.length;
}

function deserializeMole(row: any): Mole {
  // Compute days dynamically from last_analyzed_at when available
  const days = row.last_analyzed_at
    ? Math.floor((Date.now() - new Date(row.last_analyzed_at).getTime()) / 86_400_000)
    : (row.days ?? 0);
  return {
    id: row.id,
    name: row.name,
    loc: row.loc,
    score: row.score,
    risk: row.risk as RiskLevel,
    days,
    changed: !!row.changed,
    size: row.size,
    since: row.since,
    imageUri: row.image_uri ?? undefined,
    abcde: JSON.parse(row.abcde_json || '{}'),
    history: JSON.parse(row.history_json || '[]'),
    summary: row.summary,
    rec: row.rec,
  };
}
