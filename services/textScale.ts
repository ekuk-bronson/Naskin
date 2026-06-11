/**
 * Text-size scale store.
 *
 * Reactively tracks the user's "Размер текста" preference from Settings.
 * Provides a multiplier (1.0 for normal, 1.15 for large) used by hot-path
 * components to scale their font sizes.
 *
 * Usage:
 *   const scale = useTextScale();              // 1.0 | 1.15
 *   const fs = useScaledFont(14);              // 14 * scale, rounded
 *   <Text style={{ fontSize: fs }}>...</Text>
 */
import { useSyncExternalStore } from 'react';
import { getSetting, setSetting } from './storage';

export type TextSize = 'normal' | 'large';

const SCALE_MAP: Record<TextSize, number> = {
  normal: 1.0,
  large:  1.15,
};

let currentSize: TextSize = 'normal';
const listeners = new Set<() => void>();

function readPersisted(): TextSize {
  const v = getSetting('text_size');
  return v === 'large' ? 'large' : 'normal';
}

try { currentSize = readPersisted(); } catch { currentSize = 'normal'; }

export function getTextSize(): TextSize {
  return currentSize;
}

export function getTextScale(): number {
  return SCALE_MAP[currentSize];
}

export function setTextSize(size: TextSize): void {
  if (size === currentSize) return;
  currentSize = size;
  setSetting('text_size', size);
  listeners.forEach((l) => { try { l(); } catch { /* swallow */ } });
}

/** Re-read from settings (e.g. after sign-in switches user namespace). */
export function refreshTextSize(): void {
  const next = readPersisted();
  if (next !== currentSize) {
    currentSize = next;
    listeners.forEach((l) => { try { l(); } catch { /* swallow */ } });
  }
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** React hook returning the current scale (1.0 / 1.15). Re-renders on change. */
export function useTextScale(): number {
  const size = useSyncExternalStore(subscribe, getTextSize, getTextSize);
  return SCALE_MAP[size];
}

/** Convenience hook: returns `Math.round(base * scale)` for a single base size. */
export function useScaledFont(base: number): number {
  const scale = useTextScale();
  return Math.round(base * scale);
}
