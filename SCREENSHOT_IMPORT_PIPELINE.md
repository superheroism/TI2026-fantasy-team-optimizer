# Screenshot Import Pipeline

This document describes the production screenshot-import path used to populate the Fantasy board from a user-provided image. Local OCR (optical character recognition) is the primary path; a hosted vision endpoint is optional fallback behavior, not a requirement for screenshot import.

## Goals

The importer must recover, when visible:

- board layout: `legacy_3` or `expanded_5`;
- selected team for Core, Mid, and Support;
- every emblem's stat, quality tier, and trait;
- the three currently offered reroll actions;
- remaining reroll tokens.

Missing or weakly recognized fields must be surfaced for review rather than silently invented.

## High-level flow

```text
uploaded image
    ↓
decode + inspect native dimensions
    ↓
small image (≤ 2 MP)?
    ├─ yes → one native OCR pass
    └─ no  → ≤1100 px localization copy
               ↓
            locate relevant UI
               ↓
            map coordinates back to original pixels
               ↓
            crop from original image
    ↓
localize three banner columns
    ↓
infer 3- vs 5-emblem row grid
    ↓
extract teams + emblem fields
    ↓
retry weak emblem stats with targeted source-resolution OCR
    ↓
detect optional reroll-action strip + token count
    ↓
retry weak action cards from source-resolution crops
    ↓
deterministic validation + confidence review flags
    ↓
populate application state
    ↓
rerender + review highlighting
```

## 1. Image intake and scaling policy

The importer does not normalize arbitrary screenshots to a predetermined desktop resolution. User images may be manually snipped, padded, offset, or captured from different underlying display resolutions, so screenshot width and height are not reliable proxies for UI scale.

The processing policy is therefore:

- never upscale an uploaded image;
- never stretch X and Y independently;
- preserve native pixels for normal-sized screenshots;
- reduce analyzed pixels primarily by localization and cropping;
- use a low-resolution derivative only when the source is large enough to justify cheap localization;
- map all extraction coordinates back to the original image before source-detail OCR.

For images at or below approximately 2 MP, the initial OCR pass runs at native resolution and its word geometry is reused for localization. Larger images use a localization copy capped at 1100 px on the long edge.

## 2. Banner localization

The preferred structural anchors are the role headings `CORE`, `MID`, and `SUPPORT`.

If all three are confidently recognized, their horizontal centers define the three banner columns. If headings are incomplete, the parser falls back to repeated closed-vocabulary card anchors such as `TIER`, known stat tokens, and canonical trait names, clustering their x-coordinates into three approximately evenly spaced columns. Equal-third splitting is only a last-resort fallback.

## 3. Layout and row-grid inference

Within each inferred banner column, the parser searches for `TIER` anchors and pools their y-coordinates across all three roles.

```text
3 stable row levels → legacy_3
5 stable row levels → expanded_5
```

Four directly recognized row levels may be regularized to a five-row grid when their pitch supports that interpretation. Once layout is known, emblem position and color come from `BOARD_LAYOUTS`; OCR does not guess slot color.

## 4. Initial emblem extraction

For each expected emblem row the first pass extracts stat, quality tier, and trait.

Stat normalization is constrained to the slot's legal color-specific stat pool. Quality tier uses redundant Roman-numeral and displayed-bonus evidence. Trait extraction is fuzzy-matched against the five canonical trait names.

## 5. Selective targeted stat retry

Stat titles are the most OCR-sensitive emblem field. The importer retries weak reads rather than re-OCRing every emblem.

Current trigger:

```text
stat confidence < 0.90
```

The retry derives the emblem rectangle from role/row geometry, crops from the original-resolution image, uses text-oriented OCR, constrains normalization to the legal slot-color pool, and replaces the initial read only when confidence improves.

## 6. Team extraction

Each banner's visible selected-player text is compared against current model players for that role. The best supported player match maps to the optimizer's canonical team. Historical or otherwise unmappable text remains a review case rather than being converted to a guessed team.

Selected teams are part of authoritative production end-to-end correctness. They are not inferred as correct merely because visible player text was recognized.

## 7. Reroll-action and token extraction

The reroll region is optional and independent of successful board import. Anchors such as `REROLL OPERATIONS`, `ROLL TOKENS`, and repeated three-card geometry localize it.

If the region is absent, raw import returns three missing action slots with confidence 0. Validation preserves existing application actions and flags all three for review.

When visible, the three cards are handled independently and matched against the canonical action catalog. Weak card reads may receive source-resolution retries. Token count is extracted from the same region when visible.

## 8. Confidence, validation, and review behavior

The raw OCR result is passed through deterministic validation before application state changes. Validation checks include:

- supported layout;
- exact emblem count for the layout;
- slot position/color agreement with `BOARD_LAYOUTS`;
- stat legality for slot color;
- quality tier in `1..5`;
- canonical trait;
- canonical/distinct action IDs;
- non-negative integer token count when present.

The current review threshold is 0.90. Values below threshold are review targets. For fields whose product semantics preserve the current value when unresolved—most notably actions—the **final applied value may intentionally differ from a raw OCR value**.

That distinction is why raw OCR correctness cannot be used as the final screenshot-import metric.

The real UI then calls `state.importScreenshot(...)`, rerenders, applies review highlighting, and displays import status. Running optimization clears review highlighting and is treated as user confirmation.

## 9. Optional hosted fallback

`requestScreenshotImport` attempts local OCR first. If local OCR fails and a `screenshot-import-endpoint` is configured, the application may fall back to the hosted vision endpoint. The hosted path is not required for normal use.

## 10. Performance strategy

The importer optimizes analyzed pixels rather than blindly rescaling every screenshot:

- normal screenshots: native OCR plus selective retries;
- large screenshots: low-resolution localization, then original-pixel crops;
- weak stat/action fields: narrow source-resolution OCR regions;
- OCR worker reuse and optional UI-triggered prewarming.

Browser-level screenshot import has a 30-second outer certification watchdog. Worker startup is measured separately from warm-session behavior where applicable.

## 11. Verification and acceptance surfaces

Screenshot import has two test layers with different authority.

### OCR-core corpus

`scripts/test-ocr-corpus.mjs` calls the OCR/parser layer and compares raw structured output to ground truth. It answers:

> Did OCR/localization/parsing regress?

**Raw OCR/parser exactness is a diagnostic metric.**

### Production end-to-end (E2E) corpus

`scripts/test-screenshot-e2e.mjs` serves the actual `docs/` artifact and drives the same user-facing path:

```text
docs/index.html
    ↓
real application initialization
    ↓
#screenshot-file
    ↓
bindScreenshotImport
    ↓
requestScreenshotImport
    ↓
validateScreenshotImport
    ↓
state.importScreenshot
    ↓
renderStructure
    ↓
review UI/status
```

Before each import the harness creates a deterministic sentinel state so preserved current values cannot accidentally equal screenshot truth. It records raw, validated, applied, and rendered states and identifies the first divergence for every final mismatch.

**Production E2E exactness is the authoritative screenshot-import product metric.** Both application state and rendered UI must match expected final semantics.

The permanent certification harness exercises Chromium and Firefox, cold and warm worker behavior, selected teams, every emblem field, final applied actions, tokens, review highlighting, safety counters, source SHA-256, and deployment asset parity.

**v1.1 release status:** Chromium is the certified screenshot-import browser. The release-candidate corpus completed 13/13 Chromium runs with zero hard failures, OCR timeouts, or false-high-confidence errors; 9/13 rendered fully exact and 13/13 rendered the expected review state. Firefox remains uncertified for screenshot import: 13/13 release-candidate runs failed before raw import because local OCR could not resolve layout. Firefox/Tesseract parity remains follow-up work rather than a hidden release claim.

See `SCREENSHOT_OCR_CORPUS.md`, `SCREENSHOT_OCR_CORPUS_RESULTS.md`, and `P52E_PRODUCTION_E2E_CERTIFICATION.md`.

## Relevant implementation files

- `src/import/localScreenshotOcr.ts` — OCR, geometry, layout, emblem, action, and token extraction.
- `src/import/emblemOcrRefinement.ts` — selective targeted stat retry.
- `src/import/screenshotImport.ts` — local-first request path and deterministic validation.
- `src/ui/screenshotImport.ts` — real upload interaction, state import, status, review highlighting, and narrow test-only stage observer.
- `tests/test_boards/*` — committed real-image corpus and sidecars.
- `tests/fixtures/screenshot-e2e-ground-truth.json` — final-state team labels and corpus identity metadata.
- `scripts/test-ocr-corpus.mjs` — OCR-core diagnostic corpus.
- `scripts/test-screenshot-e2e.mjs` — authoritative production browser corpus.
