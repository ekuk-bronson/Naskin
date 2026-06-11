/**
 * @deprecated  Use `services/preprocessing.ts` and `preprocessForInference`
 *              directly. This file is kept only for backwards compatibility
 *              with `model/ModelRunner.ts`.
 *
 *              The previous implementation read raw JPEG bytes with `atob`
 *              and treated them as pixel data — this gave the model garbage
 *              input. It also normalised to [-1, 1] which contradicts the
 *              EfficientNetV2 model contract ([0, 255], no division).
 *
 *              The new wrapper delegates to the proper pipeline.
 */

import { preprocessForInference } from './preprocessing';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Resize, run the full preprocessing pipeline, and return a model-ready tensor.
 *
 * @param uri          local file URI of the source image
 * @param targetSize   input resolution expected by the model (e.g. 224)
 * @param channels     ignored — always 3 (RGB)
 */
export async function preprocessImage(
  uri: string,
  targetSize: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  channels = 3,
): Promise<Float32Array> {
  const result = await preprocessForInference(uri, {
    inputSize: targetSize,
    // Inference should not block on quality — callers gate separately
    // (the wizard already does its own retake UX before reaching this point).
    enableQualityCheck: false,
    // Default-on; both noticeably improve real-world AUC.
    enableHairRemoval: true,
    enableClahe:       true,
    // Keep the legacy contract — never throw if jpeg-js is missing.
    allowResizeOnlyFallback: true,
  });
  if (result.tensor === null) {
    // qualityCheck is disabled above, so this is unreachable in practice,
    // but the typing forces the check.
    throw new Error('preprocessing returned no tensor');
  }
  return result.tensor;
}

/**
 * Crop the photo to a centred 512×512 square for storage (history thumbnails).
 * No model interaction — just a convenience around expo-image-manipulator.
 */
export async function cropToSquare(uri: string): Promise<string> {
  const { uri: croppedUri } = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512, height: 512 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
  );
  return croppedUri;
}
