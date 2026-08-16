# Screenshot OCR Verification Corpus

## Purpose

Extend screenshot-import verification beyond the original single image. The primary metric is final normalized imported state, not raw OCR character accuracy.

Ground truth is stored in `tests/fixtures/screenshot-corpus-ground-truth.json`.

## Current corpus

Four manually labeled screenshots cover:

- `expanded_5` and `legacy_3` layouts;
- tight/manual crops and a full Dota desktop capture with substantial irrelevant UI;
- multiple source dimensions and UI placements;
- all emblem colors and quality tiers I-V;
- punctuation-sensitive player/team strings;
- long stat names;
- positive, zero, and negative trait bonuses;
- missing reroll-action regions.

All four current images omit the three reroll cards. Correct behavior is therefore to import the visible board, preserve existing action values, assign missing/low confidence to all three action slots, and show red review outlines on all three action cards.

## Verification metrics

For each image report:

1. board localization success;
2. layout exactness;
3. team exactness (`/3`);
4. stat exactness (`/N`);
5. tier exactness (`/N`);
6. trait exactness (`/N`);
7. action missing/present classification (`/3`);
8. false-high-confidence errors;
9. complete imported-board exactness;
10. cold and warm elapsed time;
11. source pixels, analyzed pixels, and analyzed-pixel fraction.

`N=15` for expanded-five and `N=9` for legacy-three.

## Accuracy policy

A speed or preprocessing change may not reduce final normalized accuracy on the labeled corpus. False-high-confidence errors are higher severity than explicit review states. Missing or ambiguous information must not be invented.

The current corpus is not sufficient to certify action extraction because no supplied screenshot contains the three reroll cards. Add at least one fully visible action-menu screenshot before treating action recognition as verified.

## Geometry policy

Do not normalize arbitrary manual crops to a predetermined screenshot resolution. Preserve native pixels for normal-sized images, localize/crop first, and only downscale when the relevant crop itself is computationally excessive. Large source images may use a low-resolution localization copy, but extraction crops must be mapped back to original source pixels before OCR.
