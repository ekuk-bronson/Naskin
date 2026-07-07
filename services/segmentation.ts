/**
 * segmentation.ts — on-device lesion segmentation + real ABCD.
 *
 * Runs the U-Net TFLite model (`assets/model/lesion_seg.tflite`, trained on
 * RAW resized dermoscopy) on the raw photo to produce a 256×256 lesion mask,
 * then derives clinical A/B/C/D from that mask via `computeLesionMetrics`.
 *
 * IMPORTANT: the segmentation model expects the RAW image (plain bilinear
 * resize to 256, float32 [0,255], RGB) — NOT the 8-step clinical pipeline used
 * for the classifier. That's why this module decodes the image itself instead
 * of reusing `preprocessImage`.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { computeLesionMetrics, type LesionMetrics } from './lesionMetrics';

export const SEG_SIZE = 256;

interface JpegJsLike {
  decode: (bytes: Uint8Array, opts?: { useTArray?: boolean }) =>
    { data: Uint8Array; width: number; height: number };
}
let _jpeg: JpegJsLike | null | undefined;
function loadJpeg(): JpegJsLike | null {
  if (_jpeg !== undefined) return _jpeg;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _jpeg = require('jpeg-js') as JpegJsLike;
  } catch {
    _jpeg = null;
  }
  return _jpeg;
}

function base64ToBytes(b64: string): Uint8Array {
  // RN Hermes provides global.atob (>= RN 0.74).
  const bin = (global as unknown as { atob: (s: string) => string }).atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Minimal runSync surface of a react-native-fast-tflite model. */
interface RunnableModel {
  runSync: (inputs: ArrayBuffer[]) => Array<ArrayBuffer | Float32Array>;
}

/**
 * Decode the photo to raw 256×256 RGB, run the segmentation model, and
 * compute real ABCD metrics from the mask. Returns null if anything the
 * feature depends on (jpeg-js, model output) is unavailable — the caller
 * then falls back to the classifier-derived ABCD proxy.
 */
export async function segmentAndMeasure(
  segModel: RunnableModel,
  imageUri: string,
): Promise<LesionMetrics | null> {
  const jpeg = loadJpeg();
  if (!jpeg) return null;

  // Raw bilinear resize to 256×256 (no clinical pipeline), as base64 JPEG.
  const resized = await ImageManipulator.manipulateAsync(
    imageUri,
    [{ resize: { width: SEG_SIZE, height: SEG_SIZE } }],
    { compress: 1, base64: true, format: ImageManipulator.SaveFormat.JPEG },
  );
  if (!resized.base64) return null;

  const { data: rgba, width, height } = jpeg.decode(base64ToBytes(resized.base64), { useTArray: true });
  if (width !== SEG_SIZE || height !== SEG_SIZE) return null;

  const n = SEG_SIZE * SEG_SIZE;
  const rgb = new Uint8Array(n * 3);
  const input = new Float32Array(n * 3); // [0,255], no /255 — matches training
  for (let p = 0; p < n; p++) {
    const r = rgba[p * 4], g = rgba[p * 4 + 1], b = rgba[p * 4 + 2];
    rgb[p * 3] = r; rgb[p * 3 + 1] = g; rgb[p * 3 + 2] = b;
    input[p * 3] = r; input[p * 3 + 1] = g; input[p * 3 + 2] = b;
  }

  const buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer;
  const out = segModel.runSync([buf])[0];
  const mask = out instanceof Float32Array ? out : new Float32Array(out as ArrayBuffer);
  if (mask.length !== n) return null;

  return computeLesionMetrics(mask, rgb, SEG_SIZE, SEG_SIZE);
}
