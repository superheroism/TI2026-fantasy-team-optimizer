# Screenshot OCR Resolution Benchmark

Date: 2026-08-16

Fixture: user-supplied 1536×650 TI 2026 expanded-five screenshot represented by `tests/fixtures/screenshot-expanded5-visible-no-actions.json`.

## Objective

Minimize OCR latency and memory without sacrificing final normalized import accuracy. Uploaded images are never upscaled. The preferred order is: preserve native pixels, eliminate irrelevant pixels by cropping, and only downscale when the relevant crop itself is large enough to justify it.

## Environment

Exploratory benchmark used local Tesseract 5.5 / pytesseract on Linux against the supplied screenshot. Browser production uses Tesseract.js 6 (WASM), so absolute wall-clock times are not directly interchangeable; relative strategy/resolution trends are the decision signal. Production caches the OCR worker across imports.

## Resolution sweep

Raw OCR is sensitive to rasterization. The same screenshot was tested at multiple long-edge resolutions.

| Long edge | OCR time | Tier rows localized | Raw exact emblem fields* | Final normalized emblem fields |
|---:|---:|---:|---:|---:|
| **1536 native** | ~1.02 s | 15 / 15 | 34 / 45 | **45 / 45** |
| 1500 | ~0.87 s | — | — | **45 / 45** |
| 1472 | ~0.92 s | — | — | 43 / 45 |
| **1440** | ~0.92 s | 15 / 15 | 42 / 45 | **45 / 45** |
| 1408 | ~0.99 s | — | — | 42 / 45 |
| **1400** | ~0.98 s | — | — | **45 / 45** |
| 1380 | ~0.92 s | — | — | 42 / 45 |
| 1366 | ~0.85 s | 13 / 15 | 14 / 45 | 43 / 45 |
| 1280 | ~0.88 s | 15 / 15 | 29 / 45 | 40 / 45 |
| 1152 | ~0.77 s | 12 / 15 | 18 / 45 | 38 / 45 |
| 1024 | ~0.61 s | 6 / 15 | 2 / 45 | 24 / 45 |

`*` stat, tier text, and trait text before deterministic domain normalization. Final normalization uses the legal color-specific stat pool, closed-vocabulary stat/trait matching, and quality-bonus/tier cross-checks.

The fixture correction discovered during this pass is important: Core → Teamfight is Tier III (`+60%` quality), not Tier IV. The committed ground truth was corrected before treating it as an accuracy gate.

## Native single-pass strategy benchmark

The supplied screenshot is 1536×650, approximately 1.0 MP. Its detected relevant crop is approximately 1475×637, or 94.1% of the source. Because cropping removes only ~5.9% of this already-tight screenshot, a separate localization OCR pass followed by a second extraction OCR pass duplicates most work.

Three-run medians on the supplied image:

| Strategy component | Median OCR time |
|---|---:|
| 1100px localization copy | 0.620 s |
| 1440px extraction crop | 1.100 s |
| **Current two-pass total** | **~1.720 s** |
| **Single native 1536px pass** | **0.944 s** |

The native single-pass strategy is therefore about **45% faster** on this fixture while retaining the previously measured **45/45 final normalized emblem accuracy**. It also avoids an additional 1100×465 localization canvas and 1440×622 extraction canvas. Raw RGBA canvas storage for those two derivatives is roughly 5.6 MB combined; the single-pass path instead needs only the native ~4.0 MB canvas in addition to the decoded source and OCR runtime allocations.

## Production strategy

- **Small/tight screenshots (≤2 MP):** OCR once at native resolution. Use recognized anchor/word geometry to localize the board and filter/rebase those same OCR words into the detected crop. Do not run a second OCR pass.
- **Large screenshots (>2 MP):** create a downscaled localization-only copy (max 1100px long edge), map the detected crop back to original source coordinates, then crop the original pixels.
- **Large relevant crops:** downscale only when the resulting source-pixel crop remains computationally excessive. The 1440px extraction cap remains a safeguard for this path, not a default normalization target.
- Never upscale and never stretch X and Y independently.
- Reuse one Tesseract.js worker across imports and prewarm it when the user approaches/focuses Import Screenshot.
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
