# Screenshot OCR Verification Corpus

## Purpose

Verify screenshot import against manually established ground truth across variable crops, resolutions, 3/5-emblem layouts, optional reroll regions, and full-desktop captures. The primary metric is **final normalized imported state**, not raw OCR character accuracy.

Ground truth is stored in `tests/fixtures/screenshot-corpus-ground-truth.json`.

## Current corpus

Six manually labeled screenshots cover:

- `expanded_5` and `legacy_3` layouts;
- tight/manual crops and full Dota desktop captures with substantial irrelevant UI;
- source sizes from roughly 1 MP through 4.1 MP;
- all emblem colors and quality tiers I–V;
- punctuation-sensitive player/team strings;
- long stat names;
- positive, zero, and negative trait bonuses;
- four screenshots with the reroll-action region absent;
- two screenshots with all three reroll actions visible;
- visible token counts of 4 and 5.

For action-absent fixtures, correct behavior is to import the visible board, preserve existing action values, assign missing/low confidence to all three action slots, and show red review outlines on all three action cards.

## Verification metrics

For each image report:

1. board localization success;
2. layout exactness;
3. team exactness where current roster mapping is valid (`/3`);
4. stat exactness (`/N`);
5. tier exactness (`/N`);
6. trait exactness (`/N`);
7. action exactness or correctly-missing classification (`/3`);
8. token exactness when visible;
9. false-high-confidence errors;
10. complete imported-board exactness;
11. cold and warm elapsed time;
12. source pixels, analyzed pixels, and analyzed-pixel fraction.

`N=15` for expanded-five and `N=9` for legacy-three.

## Accuracy policy

A speed or preprocessing change may not reduce final normalized accuracy on the labeled corpus. False-high-confidence errors are higher severity than explicit review states. Missing or ambiguous information must not be invented.

## Geometry policy

Do not normalize arbitrary manual crops to a predetermined screenshot resolution. Preserve native pixels for normal-sized images, localize/crop first, and only downscale when the relevant crop itself is computationally excessive. Large source images may use a low-resolution localization copy, but extraction crops must be mapped back to original source pixels before OCR.

The production parser now uses redundant geometry signals: role headings when confidently present, otherwise three-column clustering over closed-vocabulary card anchors; row evidence is pooled across banners and regularized by repeated pitch. Reroll actions use a separate strip/card ROI and source-resolution retry path.

## Certification status

The parser changes are implemented and compile-validated, but the six source screenshots are not committed as binary fixtures. Repository CI therefore cannot certify image-level accuracy from labels alone. A live six-image browser OCR sweep is required before marking screenshot recognition accuracy certified.
