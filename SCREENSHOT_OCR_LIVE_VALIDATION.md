# Screenshot OCR Live Validation

Date: 2026-08-16

## Scope

The six user-supplied screenshots were retained outside the repository and used as a live validation corpus. This pass uses native Tesseract on the actual image pixels as an engineering proxy for browser Tesseract.js; repository CI still does not contain or execute the screenshot binaries.

The corpus covers:

- four `expanded_5` / `legacy_3` board screenshots without reroll cards;
- two `legacy_3` screenshots with all three reroll cards and token counts visible;
- tight crops and full-desktop captures;
- source sizes from roughly 1.0 MP to 4.1 MP.

## Critical finding

The selective low-confidence stat-refinement crop introduced in PR #34 had the correct intent but the wrong horizontal geometry.

The implementation treated the `TIER` x-coordinate as if the stat title were substantially to its left. The live screenshots show the opposite geometry consistently:

- `TIER` is near the **left edge of the emblem card**;
- the stat title is **above the TIER row** and extends to the **right**;
- therefore the old retry ROI could mostly sample pixels outside the emblem card.

This explains why targeted stat retries could fail despite correct board localization.

## Correction

The live-validation branch changes the retry ROI to use the detected `TIER` cluster as the emblem-card left-edge anchor:

```text
x: TIER - ~3.5% column spacing  →  TIER + ~37% column spacing
y: TIER - ~43% row pitch       →  TIER - ~6% row pitch
```

The crop remains source-resolution and is never upscaled. It is only evaluated for stat fields whose first-pass confidence is below 0.90, and it replaces the first-pass stat only when the resulting constrained same-color match has higher confidence.

## Proxy results

A native-Tesseract manual-geometry proxy confirms the direction of the change: correctly positioned title-only crops recover difficult stat labels substantially more often than the prior left-of-card ROI. The proxy is not reported as browser end-to-end accuracy because it bypasses the production browser geometry implementation and uses native Tesseract 5.5 rather than Tesseract.js.

The strongest evidence from the live pass is therefore the geometry correction itself, which is directly visible and consistent across all six screenshots.

## Build state

The source change has been rebuilt with the repository's normal Node 22 build. The generated `build/` and `docs/` copies of `emblemOcrRefinement.js` and their source maps are committed and synchronized with source. The temporary regeneration workflow removed itself after completing successfully.

## Remaining acceptance gate

Before claiming screenshot import accuracy certification:

1. CI for the regenerated branch must be green;
2. the corrected branch should be exercised in the actual browser importer against the six live screenshots;
3. record final normalized layout, team, stat, tier, trait, action, token, review-state, and latency results;
4. do not merge further threshold tuning unless it improves final normalized accuracy or reduces false-high-confidence errors.
