# Screenshot OCR Corpus — Verification Results

Date: 2026-08-16

Exploratory native-Tesseract/Linux measurements are used to expose OCR/localization failure modes. Browser Tesseract.js timing will differ. Final acceptance remains normalized imported-state accuracy.

## Six-image corpus

The corpus now includes four prior screenshots plus two legacy-three screenshots with all three reroll cards and token counts visible.

New fixture A: 1232×824 (1.015 MP), tight board/action crop, tokens = 4.

- actions: `blue-trait-first`, `red-trait-all`, `green-stat-first`.
- native whole-image OCR: ~0.55 s exploratory run.
- OCR sees the action region but merges/garbles the three adjacent card labels.
- correction: the third card reads **Reroll Stat for the first Green Emblem**. This is already present in the current 20-action `ACTION_CATALOG`; the earlier `first Red Emblem` reading was a ground-truth transcription error, not a catalog gap.

New fixture B: 2560×1600 (4.096 MP), full Dota desktop, tokens = 5.

- actions: `green-stat-last`, `quality-increase-one`, `green-stat-random`.
- native whole-image OCR: ~1.19 s exploratory run.
- generic whole-image OCR sees `REROLL OPERATIONS` / token text but does not reliably recover the three card labels at this scale.
- this validates the need to localize the action strip and OCR that small region independently at source resolution rather than expecting a board-wide OCR pass to read it.

## Prior geometry results

| Fixture | Expected | Current geometry result |
|---|---|---|
| original reference | expanded_5 | PASS: 5/5/5 TIER rows |
| crimson cropped board | expanded_5 | PASS layout; Support only 2/5 TIER anchors |
| full desktop capture | expanded_5 | **FAIL: legacy_3** under equal-third fallback |
| golden cropped board | legacy_3 | PASS: 3/3/3 |

## Conclusions

1. Board localization still needs the previously identified closed-vocabulary three-column fallback and pooled vertical row grid.
2. Action recognition should be a separate ROI pipeline. Anchor on `REROLL OPERATIONS`, `ROLL TOKENS`, and/or the three button rectangles, map the action strip back to source pixels, then OCR each card separately. Do not downscale the action text merely because the full screenshot is large.
3. Action matching should remain closed-vocabulary/fuzzy after per-card OCR. The 2560×1600 fixture is a strong example where local high-resolution crops should outperform whole-image recognition while analyzing far fewer pixels.
4. The supplied authoritative action table matches the current 20-action `ACTION_CATALOG`; no catalog expansion is required from these screenshots.
5. Token extraction is now testable (4 and 5) and should use the same action-strip ROI.
6. Do not claim action-import certification yet. The remaining blockers are action-strip OCR strategy and robust board localization, not action-catalog coverage.

## Recommended implementation order

1. Implement robust board-column + pooled-row geometry fallback.
2. Implement dedicated source-resolution action-strip/card OCR and token extraction.
3. Re-run all six fixtures and report layout, teams where roster mapping is valid, stat/tier/trait exactness, action exactness, token exactness, false-high-confidence errors, and latency.
4. Only then tune thresholds/preprocessing; preserve the native/crop-first policy and avoid arbitrary resolution normalization.
