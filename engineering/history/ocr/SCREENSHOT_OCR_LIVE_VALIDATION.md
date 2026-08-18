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

## Six-image live proxy results

The corrected geometry was rerun against all six actual screenshots with native Tesseract 5.5 using the production stat-vocabulary matching rule and the same `match.score >= 0.58` acceptance gate.

### Structural geometry

- All six screenshots produced the expected 3-column TIER geometry.
- The pooled row geometry produced the expected layout on all six: 3/3 legacy-three fixtures and 3/3 expanded-five fixtures.
- This includes both full-desktop screenshots with unrelated Dota UI around the board.

### Targeted stat refinement

There are 72 labeled emblem stat fields across the corpus.

If the corrected title crop is forced to classify every field, 55/72 (76.4%) land on the correct canonical stat. This forced-classification number is **not** the production behavior and should not be used as the import accuracy metric.

The production safety gate is the important result:

- 25 targeted crops reached `match.score >= 0.58`;
- **25/25 accepted matches were correct**;
- **0/25 accepted matches were false replacements**;
- all 17 incorrect forced classifications scored below 0.58 (maximum incorrect score 0.50), so the current gate rejected them rather than promoting them over the first-pass result.

Per-image accepted/correct targeted replacements in this native proxy:

| Fixture | Accepted | Correct | False accepted |
|---|---:|---:|---:|
| 1536×650 expanded-five reference | 12 | 12 | 0 |
| 1515×867 expanded-five crop | 4 | 4 | 0 |
| 1536×864 expanded-five full desktop | 5 | 5 | 0 |
| 1363×814 legacy-three crop | 2 | 2 | 0 |
| 1232×824 legacy-three + actions | 1 | 1 | 0 |
| 2560×1600 legacy-three + actions | 1 | 1 | 0 |

This is the key validation of PR #35: the corrected retry path is **conservative and precision-oriented**. It recovers a meaningful subset of difficult titles while the acceptance threshold prevented every observed bad crop from overwriting the first-pass value.

### Runtime proxy

Native subprocess timing for one whole-image geometry read plus title crops for every emblem was approximately:

| Fixture | Time |
|---|---:|
| 1536×650 | 2.13 s |
| 1515×867 | 2.26 s |
| 1536×864 | 2.28 s |
| 1363×814 | 1.46 s |
| 1232×824 | 1.37 s |
| 2560×1600 | 2.08 s |

These values are deliberately pessimistic relative to production because the proxy launches native Tesseract repeatedly and retries **every** emblem. Production reuses a browser worker and only retries fields whose first-pass confidence is below 0.90.

### Previously validated unchanged paths

PR #35 changes only the targeted stat-title ROI. The earlier live corpus pass had already established the unchanged paths used by PR #34:

- both action-visible screenshots yielded all six reroll actions with dedicated action-card ROIs;
- token counts were 2/2 exact (`4` and `5`);
- action-absent screenshots correctly represent missing/low-confidence action regions rather than inventing actions.

Those paths were not changed by PR #35.

## Build state

The source change has been rebuilt with the repository's normal Node 22 build. The generated `build/` and `docs/` copies of `emblemOcrRefinement.js` and their source maps are committed and synchronized with source. The temporary regeneration workflow removed itself after completing successfully. CI run #937 passed typecheck, lint, generated-artifact verification, and tests before this documentation-only update.

## Interpretation and remaining limitation

The six-image rerun materially validates the latest **geometry and targeted-stat safety behavior**. It does not convert the external corpus into a repository-level browser E2E certification: native Tesseract 5.5 is still an engineering proxy for Tesseract.js, and this evaluation isolates the revised stat-refinement path rather than reproducing the entire browser UI/import event loop.

The evidence supports merging the geometry correction because accepted targeted retries were 100% precise on the live corpus and no false replacement crossed the production threshold. Future OCR tuning should continue to optimize final normalized accuracy and false-high-confidence error rate rather than raw OCR character accuracy.
