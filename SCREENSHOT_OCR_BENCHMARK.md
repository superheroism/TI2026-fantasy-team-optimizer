# Screenshot OCR Resolution Benchmark

Date: 2026-08-16

Fixture: user-supplied 1536×650 TI 2026 expanded-five screenshot represented by `tests/fixtures/screenshot-expanded5-visible-no-actions.json`.

## Objective

Choose a useful OCR working resolution without ever upscaling the uploaded image. The production parser uses a low-resolution localization pass, crops the relevant board area in source coordinates, and then performs extraction on the crop at `min(native size, extraction cap)`.

## Environment

Exploratory benchmark used local Tesseract 5.3.4 / pytesseract on Linux against the supplied screenshot. Browser production uses Tesseract.js 6 (WASM), so absolute wall-clock times are not directly interchangeable; the resolution/accuracy trend is the decision signal. Production also caches the OCR worker across imports.

## Whole-image recognition sweep

| Long edge | OCR time | Canonical anchor/stat/trait strings found |
|---:|---:|---:|
| 1536 | 1.04 s | 17 / 17 |
| 1500 | 0.87 s | 15 / 17 |
| 1472 | 0.92 s | 15 / 17 |
| **1440** | **0.96 s** | **16 / 17** |
| 1408 | 0.99 s | 15 / 17 |
| 1400 | 0.98 s | 15 / 17 |
| 1380 | 0.92 s | 16 / 17 |
| 1366 | 0.96 s | 16 / 17 |
| 1280 | 0.86 s | 14 / 17 |
| 1024 | 0.49 s | 8 / 17 |
| 768 | 0.26 s | 4 / 17 |
| 640 | 0.13 s | 2 / 17 |

## Structured emblem-row sweep

The same OCR output was grouped by banner and `TIER` row and compared against the 15-emblem ground truth. This is deliberately stricter than general OCR-string recall.

| Long edge | OCR time | Tier rows localized | Exact visible emblem fields* |
|---:|---:|---:|---:|
| 1536 | 1.02 s | 15 / 15 | 34 / 45 |
| **1440** | **0.92 s** | **15 / 15** | **42 / 45** |
| 1366 | 0.85 s | 13 / 15 | 14 / 45 |
| 1280 | 0.88 s | 15 / 15 | 29 / 45 |
| 1152 | 0.77 s | 12 / 15 | 18 / 45 |
| 1024 | 0.61 s | 6 / 15 | 2 / 45 |

`*` stat, tier text, and trait text before domain-aware fuzzy normalization. The production parser performs constrained stat/trait matching and quality-bonus cross-checking, so this raw OCR measure is intentionally conservative.

The fixture correction discovered during this pass is important: Core → Teamfight is Tier III (`+60%` quality), not Tier IV. The committed ground truth was corrected before treating it as an accuracy gate.

## Production decision

- Localization pass cap: **1100 px** long edge. This pass only needs robust structural anchors (`CORE`, `MID`, `SUPPORT`, repeated `TIER` rows) and is not used as final field text.
- Extraction pass cap: **1440 px** long edge, but only after source-coordinate cropping.
- Never upscale: `scale = min(1, cap / nativeDimension)` for both passes.
- Reuse one Tesseract.js worker across imports; prewarm it when the user hovers/focuses the Import Screenshot button.
- Treat missing regions independently. A missing action region returns three null actions at confidence 0 and preserves the existing menu while outlining all three action cards in red.
- Use deterministic legal-slot colors and legal stat pools as validation, not as permission to invent missing text.

## Accuracy policy

A speed optimization is acceptable only if complete-field accuracy is not reduced on the labeled corpus. One screenshot is insufficient for certification. Add cropped, padded, high-resolution, low-resolution, and partially irrelevant screenshots to the corpus as they are collected and track:

- board localization success;
- 3-vs-5 layout accuracy;
- exact team accuracy;
- exact stat / tier / trait accuracy;
- exact operation accuracy;
- false-high-confidence errors;
- warm and cold latency;
- analyzed-pixel fraction after cropping.

False-high-confidence errors are the highest-severity failure mode. Missing or ambiguous regions should be red-review states rather than guessed values.
