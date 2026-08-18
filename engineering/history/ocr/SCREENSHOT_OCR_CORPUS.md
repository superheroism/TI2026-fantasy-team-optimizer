# Screenshot Import Verification Corpora

## Purpose

Screenshot import now has two intentionally separate verification layers.

### OCR-core corpus

`scripts/test-ocr-corpus.mjs` exercises the OCR/parser layer and compares the raw `requestScreenshotImport()` result with manually established field labels.

Its purpose is diagnostic:

> Did localization, OCR, normalization, or parsing regress?

**Raw OCR/parser exactness is a diagnostic metric.** It is not the final product-accuracy metric because it does not exercise validation, preserved current values, application-state import, rerendering, or review highlighting.

### Production E2E corpus

`scripts/test-screenshot-e2e.mjs` serves the actual `docs/` application, loads `docs/index.html`, waits for normal model/application initialization, establishes a deterministic sentinel state, and supplies the committed screenshot through the real hidden `#screenshot-file` input.

It exercises:

```text
bindScreenshotImport(...)
    ↓
requestScreenshotImport(...)
    ↓
validateScreenshotImport(...)
    ↓
state.importScreenshot(...)
    ↓
renderStructure()
    ↓
review highlighting / status
```

**Production E2E exactness is the authoritative screenshot-import product metric.**

## Current committed corpus

Six real screenshots and their manually labeled sidecars are committed under `tests/test_boards/`.

The corpus covers:

- `expanded_5` and `legacy_3` layouts;
- cropped and full-client/full-desktop captures;
- variable source resolutions;
- all three legal emblem colors;
- quality tiers I–V;
- all canonical traits;
- long and multiline stat names;
- action-visible and difficult action-region cases;
- multiple visible token counts;
- punctuation-sensitive roster text such as `No[o]ne-` and `Malr1ne`.

`tests/fixtures/screenshot-e2e-ground-truth.json` adds canonical selected-team labels needed for final-state scoring. The production E2E runner records source filename, dimensions, byte size, SHA-256, and MIME type for every image so manual and automated reproduction can prove that the same bytes were used.

## Deterministic sentinel state

Validation is allowed to preserve current application values for unresolved/low-confidence fields. Therefore each production E2E case begins from a known sentinel state whose teams, emblem values, three operation IDs, and token count deliberately differ from screenshot truth where possible.

This makes preservation observable. For example:

```text
raw action = expected screenshot action
raw confidence = 0.85
validator preserves sentinel action
final applied action = sentinel action
```

The OCR-core layer may call the raw value correct. The Production E2E layer must call the final action incorrect and classify the first divergence as validation.

## Verification metrics

For every production E2E run report:

1. layout correctness;
2. selected-team correctness `/3`;
3. stat correctness `/N`;
4. tier correctness `/N`;
5. trait correctness `/N`;
6. final applied actions `/3`;
7. token correctness;
8. review-state correctness;
9. raw exactness;
10. validated exactness;
11. applied-state exactness;
12. rendered-state exactness;
13. raw-to-final discrepancy count;
14. false-high-confidence errors;
15. OCR timeout count;
16. invalid OCR geometry count;
17. cold/warm import time;
18. browser family/version;
19. source image identity;
20. first-divergence category for every final mismatch.

`N=15` for expanded-five and `N=9` for legacy-three.

First-divergence categories are:

```text
RAW_OCR_ERROR
VALIDATION_REJECTED_CORRECT_RAW_VALUE
VALIDATION_CHANGED_VALUE
APPLY_STATE_ERROR
RENDER_MISMATCH
GROUND_TRUTH_UNMAPPABLE
```

## Browser and timing policy

Permanent production certification covers real Chromium and Firefox engines.

- **Cold:** fresh browser context with no live OCR worker for that case.
- **Warm:** same application session after OCR worker initialization.

Board 2 is the canary and is repeated cold, warm-1, and warm-2 per browser. Every import is guarded by a 30-second browser-level watchdog.

Native Tesseract subprocess timing and browser Tesseract.js timing are different measurements and must not be compared as equivalent.

## Accuracy and safety policy

A production change may not create a new final-state regression relative to the accepted Production E2E baseline.

Regardless of known accuracy mismatches, the following remain hard failures:

- false-high-confidence recognition errors;
- invalid OCR geometry;
- unbounded imports / watchdog timeouts;
- browser/harness crashes that prevent certification.

Missing or ambiguous fields must remain explicit review states rather than fabricated confident values.

## Geometry policy

Do not normalize arbitrary manual crops to a predetermined screenshot resolution. Preserve native pixels for normal-sized images, localize/crop first, and only downscale when the relevant crop is computationally excessive. Large source images may use a low-resolution localization copy, but extraction crops must be mapped back to original source pixels before OCR.

The parser uses role-heading anchors when available, repeated closed-vocabulary card anchors as a three-column fallback, pooled row evidence for 3/5-emblem layout inference, and a separate action-strip path.

## Commands

```text
npm run test:ocr-corpus
npm run test:screenshot-e2e
npm run test:screenshot-e2e:chromium
npm run test:screenshot-e2e:firefox
npm run test:screenshot-e2e:board2
```

The OCR-core command remains useful for parser diagnosis. The Production E2E commands define user-facing screenshot-import certification.
