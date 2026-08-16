# Screenshot OCR Corpus — Verification Results

Date: 2026-08-16

Exploratory native-Tesseract/Linux measurements are used to expose OCR/localization failure modes. Browser Tesseract.js timing will differ. Final acceptance remains normalized imported-state accuracy.

## Six-image corpus

The corpus includes four board-only screenshots plus two legacy-three screenshots with all three reroll cards and token counts visible.

Action fixture A: 1232×824 (1.015 MP), tight board/action crop, tokens = 4.

- actions: `blue-trait-first`, `red-trait-all`, `green-stat-first`.
- native whole-image OCR: ~0.55 s exploratory run.
- whole-image OCR sees the action region but merges/garbles adjacent card labels.
- correction from the user-supplied authoritative action table: the third card is **Reroll Stat for the first Green Emblem**. The current 20-action `ACTION_CATALOG` is complete for the supplied evidence.

Action fixture B: 2560×1600 (4.096 MP), full Dota desktop, tokens = 5.

- actions: `green-stat-last`, `quality-increase-one`, `green-stat-random`.
- native whole-image OCR: ~1.19 s exploratory run.
- generic whole-image OCR sees `REROLL OPERATIONS` / token text but does not reliably recover the three individual card labels.

## Baseline geometry findings

| Fixture | Expected | Baseline result before geometry change |
|---|---|---|
| original reference | expanded_5 | PASS: 5/5/5 TIER rows |
| crimson cropped board | expanded_5 | PASS layout; Support only 2/5 TIER anchors |
| full desktop capture | expanded_5 | **FAIL: legacy_3** under equal-third fallback |
| golden cropped board | legacy_3 | PASS: 3/3/3 |

## Implemented parser changes

The branch now addresses the failure mechanisms found by the corpus:

1. **Three-column fallback.** If all `CORE` / `MID` / `SUPPORT` headings are not confidently found, repeated closed-vocabulary card anchors (`TIER`, stat tokens, traits) are clustered into three horizontal card columns instead of dividing the entire uploaded screenshot into equal thirds.
2. **Pooled row geometry.** `TIER` evidence is pooled across all three banners. A role no longer needs to OCR every row independently. Four-row evidence can be regularized to a five-row grid from the repeated pitch, preventing the observed 5→3 collapse.
3. **Native/crop-first policy retained.** Normal-size screenshots use native OCR once. Large screenshots use a low-resolution localization copy, then map extraction back to original pixels. No image is upscaled.
4. **Dedicated action-strip path.** `REROLL OPERATIONS` / `ROLL TOKENS` anchor the strip. Each of the three action-card regions is evaluated independently; weak whole-board OCR is retried on the corresponding original-resolution source crop and fuzzy-matched against the closed 20-action catalog.
5. **Token extraction.** The same action region now parses an integer token count when visible.
6. **Failure remains review-safe.** Missing/unreadable action regions still return `null` with confidence 0, preserving current action values and red review outlines rather than fabricating values.

## Build and contract validation

The implementation typechecks and lints under the repository's strict TypeScript configuration. Generated `build/` and `docs/` artifacts were regenerated from source. A deterministic corpus contract test now verifies both layouts are represented, action-visible/absent cases are represented, emblem counts match the declared layout, token ground truth includes 4 and 5, and all six visible action IDs/labels remain synchronized with the canonical `ACTION_CATALOG`.

## Remaining verification

The six screenshots themselves are not committed as binary test fixtures, so repository CI cannot truthfully claim image-level OCR accuracy from the JSON labels alone. The next live corpus pass must feed the six actual images through the browser OCR path and record:

- exact layout;
- exact teams where roster mapping is valid;
- exact stat / tier / trait fields;
- exact action order;
- exact token count;
- false-high-confidence errors;
- cold/warm latency and analyzed-pixel fraction.

Until that live pass is completed, the geometry/action implementation should be treated as **implemented and compile/contract-verified, not accuracy-certified**. Threshold tuning should follow the live pass rather than precede it.
