# Screenshot import

Screenshot import fills the Fantasy board from a user-provided image. Local optical character recognition (OCR) is the primary path. An optional hosted vision endpoint can be used as a fallback.

## What it reads

When visible, the importer tries to recover:

- the 3-emblem or 5-emblem board layout;
- selected teams for Core, Mid, and Support;
- each emblem's stat, quality tier, and trait;
- the three offered reroll actions;
- the remaining token count.

The importer does not silently invent uncertain values. Fields that cannot be resolved with enough confidence are shown for review.

## Processing flow

```text
image
 ↓
locate the Fantasy UI
 ↓
identify role columns and emblem rows
 ↓
read teams and emblem fields
 ↓
read reroll actions and tokens when visible
 ↓
retry weak fields from focused image crops
 ↓
validate against known game rules
 ↓
populate the board and highlight review items
```

## Image handling

The importer works from the uploaded image's native geometry instead of assuming one fixed screen resolution.

Normal screenshots are analyzed at native resolution. Large images can use a smaller copy for localization, followed by source-resolution crops for detailed reads. The importer does not stretch the image or independently rescale its axes.

## Board detection

The preferred anchors are the `CORE`, `MID`, and `SUPPORT` headings. When those are incomplete, the importer can use repeated known card text and geometry to locate the three role columns.

Repeated tier rows identify whether the screenshot contains the 3-emblem or 5-emblem layout. Once the layout is known, emblem position and color come from the application's board-layout rules rather than OCR.

## Emblem fields

Each emblem contains a stat, quality tier, and trait.

Stat matching is restricted to the legal pool for that emblem color. Quality can use both the displayed tier and bonus as evidence. Traits are matched against the known trait catalog.

Weak stat reads can be retried from a focused source-resolution crop. A retry replaces the original result only when it improves confidence.

## Teams, actions, and tokens

Visible player text is matched against the current model roster to resolve each role's team. Unresolved text remains a review item rather than being converted to a guessed team.

The reroll-action area is optional. When present, each action card is matched independently against the action catalog. Weak cards can receive focused retries. The token count is read from the same region when visible.

If the action area is missing or unresolved, validation preserves existing application values where appropriate and asks the user to review them.

## Validation and review

Before imported values change application state, deterministic validation checks that they are compatible with the current model. Examples include:

- supported board layout;
- correct emblem count and slot placement;
- legal stat for the emblem color;
- valid quality tier and trait;
- known, distinct reroll actions;
- non-negative token count.

Review state is based on the final applied result, not raw OCR alone. This matters when the safe behavior is to preserve an existing value instead of applying an uncertain read.

## Browser support

Chromium is the certified screenshot-import browser for v1.1. The release-candidate corpus completed all Chromium runs without hard failures, OCR timeouts, or false-high-confidence errors. Uncertain results were surfaced for review as intended.

Firefox screenshot import is not certified in v1.1 because the tested local OCR path could not reliably resolve the board layout. This limitation applies to screenshot import only; it does not change optimizer scoring or search behavior.

## Verification

Screenshot import has two main test layers:

- **OCR corpus:** checks localization, recognition, and parsing against known screenshots.
- **Production end-to-end corpus:** drives the deployed application path and checks the final applied state, rendered board, and review behavior.

The production end-to-end result is the authoritative product metric because it verifies what the user actually sees, not only the intermediate OCR output.

## Main implementation files

- `src/import/localScreenshotOcr.ts` — OCR, geometry, and field extraction.
- `src/import/emblemOcrRefinement.ts` — focused stat retries.
- `src/import/screenshotImport.ts` — request flow and validation.
- `src/ui/screenshotImport.ts` — upload interaction and review UI.
- `tests/test_boards/` — real-image test corpus.
- `scripts/test-ocr-corpus.mjs` — OCR diagnostic corpus.
- `scripts/test-screenshot-e2e.mjs` — production browser corpus.

Detailed release experiments and historical OCR tuning records belong in the engineering history rather than this current-system reference.