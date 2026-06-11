# DermaMap preprocessing pipeline

8-step pipeline that brings any smartphone photo close to the training
distribution of the HAM10000 classifier. Two reference implementations:

| File                        | Where it runs                | Used for                       |
|-----------------------------|------------------------------|--------------------------------|
| `model/preprocessing.py`    | Kaggle / Colab / pytest      | Reference, evaluation, ground truth |
| `services/preprocessing.ts` | React Native (on-device)     | Production app                 |

Both expose the same 8 steps in the same order:

```
raw image
  ↓ 1. qualityCheck     → ok/reason/metrics, never blocks
  ↓ 2. segmentLesion    → binary mask (Otsu + morphology, fallbacks)
  ↓ 3. cropToLesion     → square crop, 15% padding, centre-crop fallback
  ↓ 4. hairRemoval      → DullRazor (BlackHat + inpaint)
  ↓ 5. shadesOfGray     → Minkowski p=6 colour constancy
  ↓ 6. claheIllumination→ CLAHE on L of LAB
  ↓ 7. resizeToInput    → bilinear → 224×224
  ↓ 8. toModelInput     → float32 in [0, 255]  ⚠ NOT divided by 255
```

## ⚠ The single rule you must not break

**Do not divide by 255.** The model has its own internal normalisation;
sending it `[0, 1]` input makes it see the input at 1/255 the trained scale
and you get garbage probabilities. This is checked by
`test_to_model_input.test_does_not_divide_by_255`. Both implementations have
a large warning around the conversion step.

## Quickstart — Python

```bash
pip install opencv-python numpy scikit-image matplotlib pytest

# Place a few mole photos in test_images/ at the project root.
pytest model/test_preprocessing.py -v

# Visual walkthrough of every stage
jupyter notebook model/test_visual.ipynb
```

```python
import cv2
from model.preprocessing import preprocess_for_inference

img = cv2.cvtColor(cv2.imread("photo.jpg"), cv2.COLOR_BGR2RGB)
tensor, quality = preprocess_for_inference(img)

if tensor is None:
    print("Reject:", quality["reason"])     # e.g. "quality.blurry"
else:
    # Feed `tensor` directly into the TFLite interpreter — shape [224,224,3] float32 [0,255]
    ...
```

## Quickstart — React Native

```bash
# expo-image-manipulator is already in the project. For the full pipeline:
npm i jpeg-js
```

```ts
import { preprocessForInference } from '../services/preprocessing';

const result = await preprocessForInference(imageUri, {
  enableQualityCheck: true,
  enableHairRemoval:  true,
  enableClahe:        true,
});

if (result.tensor === null) {
  // Show the i18n key from quality.reason: 'quality.blurry', 'quality.dark', etc.
}
if (result.degraded) {
  // jpeg-js missing — only resize+float happened. Tell the user to install it.
}
```

## Without `jpeg-js`

The TS pipeline degrades gracefully:

- `isFullPipelineAvailable()` → `false`
- `preprocessForInference()` returns `degraded: true`
- Only resize+float are performed; segmentation/colour/CLAHE/hair are skipped
- `tensor` is a valid mid-grey filled `Float32Array` to keep the app working,
  but the model will get a degraded input. **Install `jpeg-js` for production.**

To force a hard error instead of the degraded fallback:

```ts
preprocessForInference(uri, { allowResizeOnlyFallback: false });
```

## Differences from the Python reference (intentional)

| Step              | Python (cv2)         | TypeScript                    | Why                              |
|-------------------|----------------------|-------------------------------|----------------------------------|
| Gaussian blur     | `cv2.GaussianBlur 5×5`| 3×3 box blur                 | Cheap; same-order denoise        |
| Morphology kernel | 7×7 / 17×17 cross    | square radius 3 / radius 8    | No structuring element library; visually equivalent |
| Hair inpaint      | `INPAINT_TELEA`      | 7×7 neighbour-mean, 2 passes  | TELEA needs a native module; weaker but works |
| CLAHE             | OpenCV CLAHE         | Tile-based clipped HE on luma | Custom port; results within ~5/255 |
| Bilinear resize   | `cv2.resize INTER_LINEAR` | Manual bilinear with -0.5 px offset | Matches OpenCV's pixel-centre convention |

These deltas keep the JS pipeline self-contained (no native modules) at the
cost of <5 pixel-value divergence on average images — the per-spec tolerance.

## Bit-exactness test

The spec requires `max |py - js| < 5` per pixel. The harness:

1. On the device (or in the RN dev tools) call `preprocessForInference(uri)`,
   serialise `result.tensor` to JSON, save as
   `model/js_outputs/<image_stem>.json` with shape `{ tensor: number[] }`.
2. Drop the same input images into `test_images/`.
3. Run `pytest model/test_preprocessing.py::test_bit_exactness_vs_js -v`.

The test is auto-skipped when `js_outputs/` is missing — local dev stays green.

## Performance budget

Target: < 500 ms total on a Snapdragon 730 mid-range device.

Measured per-step on a 480×480 synthetic image (Python, M1 Pro — for shape only):

| Step              | ~ms |
|-------------------|-----|
| segmentation      | 5   |
| quality check     | 1   |
| crop              | <1  |
| hair removal      | 25  |
| shades of gray    | 6   |
| CLAHE             | 4   |
| resize 224        | 1   |
| float conversion  | <1  |
| **total**         | ~45 |

JS on-device will be ~3–6× slower because of typed-array hot loops. Expect
~200–350 ms total with `jpeg-js`. If you need to hit budget on a low-end
device, disable hair removal and/or CLAHE via the options flags — these are
the two most expensive steps and contribute least to AUC.

## Things you should NOT do

- ❌ Divide by 255 anywhere (step 8 already excludes this — don't "fix" it)
- ❌ Use BGR — both pipelines are RGB end-to-end
- ❌ Apply ImageNet `mean`/`std` — the model has its own normalisation
- ❌ Run augmentation in the inference pipeline (training only)
- ❌ Cache the JPEG decoder result — input URIs change every shot

## Files

```
model/
  preprocessing.py        # Python reference
  test_preprocessing.py   # pytest — unit + e2e + bit-exact (parametrised)
  test_visual.ipynb       # side-by-side stage visualisation
  README_preprocessing.md # this file

services/
  preprocessing.ts        # RN pipeline (mirrors preprocessing.py)
  imagePreprocessor.ts    # legacy; calls into preprocessing.ts for back-compat
```
