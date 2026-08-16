# Screenshot Import Pipeline

This document describes the production screenshot-import path used to populate the Fantasy board from a user-provided image. Local OCR is the primary path; a hosted vision endpoint is optional fallback behavior, not a requirement for screenshot import.

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

The preferred structural anchors are the role headings:

- `CORE`
- `MID`
- `SUPPORT`

If all three are confidently recognized, their horizontal centers define the three banner columns.

If role headings are incomplete, the parser falls back to repeated closed-vocabulary card anchors, including:

- `TIER`;
- known stat tokens;
- `Fractal`, `Friendly`, `Vampiric`, `Unique`, and `Benevolent`.

The x-coordinates of these repeated anchors are clustered into three approximately evenly spaced columns. This prevents unrelated UI, such as the Dota navigation/sidebar area, from shifting the assumed Core/Mid/Support regions.

An equal-third split of the available image remains only a last-resort fallback when stronger geometry cannot be established.

## 3. Layout and row-grid inference

Within each inferred banner column, the parser searches for `TIER` anchors and pools their y-coordinates across all three roles.

The layout decision uses the pooled row structure rather than requiring each role to expose every row independently:

```text
3 stable row levels → legacy_3
5 stable row levels → expanded_5
```

When four row levels are directly recognized and their spacing supports a regular five-row grid, the missing level can be inferred from the repeated vertical pitch. This protects the 5-emblem layout from collapsing to 3 emblems because one banner has weak OCR on one or more `TIER` labels.

Once the layout is known, emblem position and color come from `BOARD_LAYOUTS`; OCR does not guess slot color.

## 4. Initial emblem extraction

For each expected emblem row, the first pass extracts:

- stat;
- quality tier;
- trait.

Stat normalization is constrained to the target slot's legal color-specific stat pool. An OCR result cannot normalize to a stat that is illegal for the emblem's color.

Quality tier uses redundant evidence:

- Roman numeral `TIER I` through `TIER V`;
- displayed quality bonus mapping: `+10`, `+30`, `+60`, `+100`, `+150` percent.

Trait extraction is fuzzy-matched against the five canonical trait names.

## 5. Selective targeted stat retry

Stat titles are the most OCR-sensitive emblem field. The importer therefore retries only weak stat reads rather than re-OCRing every emblem.

Current trigger:

```text
stat confidence < 0.90
```

For a weak stat:

1. derive the exact emblem rectangle from the known role/row grid;
2. crop only the stat-title portion from the original-resolution image;
3. OCR that small region independently with a text-oriented segmentation mode;
4. fuzzy-match the result only against the legal stat pool for that slot color;
5. replace the initial result only when the targeted read improves confidence.

This keeps clean fields such as `GPM` on the cheap path while giving difficult labels such as `TEAMFIGHT PARTICIPATION`, `COURIER KILLS`, `FIRST BLOOD`, or `WARDS PLACED` a focused retry.

## 6. Team extraction

Each banner's visible selected-player text is compared against the current model's players and attached players for that role. The best supported player match maps to the canonical team used by the optimizer.

Historical or otherwise unmappable roster text should remain a review case rather than being converted to a guessed current team.

## 7. Reroll-action and token extraction

The reroll region is optional and independent of successful board import.

The parser searches for action-region anchors such as:

- `REROLL OPERATIONS`;
- `ROLL TOKENS`;
- the repeated three-card geometry.

If the region is absent, the importer returns three missing action slots with confidence 0. Validation preserves the application's existing action values and flags all three action cards for review.

When the region is visible, the three action cards are treated independently. Each card is OCRed and fuzzy-matched against the canonical 20-action catalog. Weak whole-image/card reads are retried on the corresponding original-resolution source crop.

The token count is extracted from the same action region when visible.

## 8. Confidence, validation, and review behavior

The raw OCR result is passed through deterministic validation before application state is changed. Validation checks include:

- supported layout;
- exact expected emblem count for the layout;
- slot position and color agreement with `BOARD_LAYOUTS`;
- stat legality for slot color;
- quality tier in `1..5`;
- canonical trait;
- canonical and distinct action IDs;
- non-negative integer token count when present.

The current review threshold is 0.90. Fields below that threshold are surfaced as low-confidence review targets.

Missing reroll actions are explicitly confidence 0. The UI preserves existing values and outlines affected action cards in red. Low-confidence banner/emblem fields receive corresponding red review outlines. Running optimization clears the red review state and is treated as user confirmation of the imported board.

## 9. Optional hosted fallback

`requestScreenshotImport` attempts local OCR first. If local OCR fails and a `screenshot-import-endpoint` is configured, the application may fall back to the hosted vision endpoint.

The hosted path is not required for normal use. A user without LLM/API access retains the local OCR importer.

## 10. Performance strategy

The importer optimizes analyzed pixels rather than blindly rescaling every screenshot:

- normal screenshots: one native OCR pass plus selective tiny retries;
- large screenshots: low-resolution localization, then original-pixel crops;
- reroll cards and weak stat titles: narrow source-resolution OCR regions;
- OCR worker is reused and may be prewarmed from Import Screenshot UI interaction.

This architecture intentionally spends additional OCR only on fields where confidence or geometry indicates it is useful.

## 11. Verification

`SCREENSHOT_OCR_CORPUS.md` and `SCREENSHOT_OCR_CORPUS_RESULTS.md` describe the current six-image live verification corpus and its acceptance metrics. The screenshot binaries are intentionally not committed to the repository; image-level regression testing is performed live against labeled ground truth.

Primary acceptance metrics are final normalized imported-state accuracy and false-high-confidence errors, not raw OCR character accuracy.

## Relevant implementation files

- `src/import/localScreenshotOcr.ts` — native OCR, geometry, layout, emblem, action, and token extraction.
- `src/import/emblemOcrRefinement.ts` — selective targeted stat-title OCR retry.
- `src/import/screenshotImport.ts` — local-first request path, deterministic validation, and optional hosted fallback.
- `src/ui/screenshotImport.ts` — upload interaction, application-state import, status text, and red review highlighting.
- `tests/fixtures/screenshot-corpus-ground-truth.json` — labeled corpus ground truth.
- `tests/screenshot-import-corpus.test.mjs` — deterministic corpus/catalog contract checks.
