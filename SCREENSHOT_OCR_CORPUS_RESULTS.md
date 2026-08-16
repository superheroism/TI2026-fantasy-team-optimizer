# Screenshot OCR Corpus — First Verification Results

Date: 2026-08-16

These are exploratory native-Tesseract/Linux measurements using the production parser's current localization/layout heuristics (heading centers with equal-third fallback and repeated `TIER` rows). Browser Tesseract.js timing will differ, but the localization/layout failure modes are directly actionable.

## Images

| Fixture | Source size | Pixels | Expected layout | Native OCR median (3 runs) | Current detected TIER rows Core/Mid/Support | Current layout result |
|---|---:|---:|---|---:|---|---|
| original reference | 1536×650 | 0.998 MP | expanded_5 | ~0.63 s | 5 / 5 / 5 | PASS expanded_5 |
| crimson cropped board | 1515×867 | 1.314 MP | expanded_5 | ~0.65 s | 5 / 5 / 2 | PASS layout, weak Support row localization |
| full desktop capture | 1536×864 | 1.327 MP | expanded_5 | ~0.85 s | 0 / 4 / 3 under current fallback bands | **FAIL: legacy_3** |
| golden cropped board | 1363×814 | 1.109 MP | legacy_3 | ~0.59 s | 3 / 3 / 3 | PASS legacy_3 |

Timing is OCR-engine exploratory timing, not end-to-end browser import latency.

## Findings

1. The native/crop-first performance policy remains appropriate: every supplied image is only about 1.0–1.33 MP, so none needs extraction downscaling for memory or compute reasons.
2. Layout detection is not yet robust enough. The full-desktop fixture demonstrates that relying on successful OCR of all `CORE`/`MID`/`SUPPORT` headings and then falling back to equal image thirds is unsafe: the left Dota sidebar shifts the actual board far to the right.
3. Requiring each role independently to expose all `TIER` rows is also unnecessarily brittle. The crimson fixture recognizes all five rows in Core/Mid but only two Support `TIER` labels even though the five cards are plainly present.
4. The three banner card columns still produce strong repeated closed-vocabulary OCR anchors (stats, traits, and `TIER`) even when role headings fail. On the full-desktop fixture these anchors cluster around x≈582, 961, and 1342, which correctly identifies the three banner/card columns despite the irrelevant sidebar.
5. TIER rows are vertically aligned across banners. Pooling row evidence across roles recovers five global row levels for the crimson fixture. On the full-desktop fixture four levels are directly seen and the missing level is identifiable from the near-regular ~70 px row pitch. This is a better basis for layout inference than per-role TIER counts alone.
6. All four screenshots genuinely omit the reroll cards. Expected action behavior remains three missing/zero-confidence action fields and three red action-card review outlines.

## Required parser follow-up before calling the corpus verified

- Replace equal-third fallback localization with three-column clustering over repeated closed-vocabulary card anchors (stat tokens, trait tokens, and TIER).
- Pool vertical row evidence across all three columns and regularize the repeated row pitch; use the resulting global 3/5 row grid when one role's TIER OCR is incomplete.
- Retain heading anchors when they are confidently available; the card-anchor geometry is a redundant fallback, not a replacement.
- Re-run final normalized stat/tier/trait accuracy after those geometry fixes. Do not claim complete-board accuracy from the current corpus until the full-desktop fixture passes localization/layout.
- Team scoring for newly supplied historical screenshots should only be treated as exact where the visible player selection can be mapped to the current model roster without guessing; otherwise it is a review-state test.
- Action extraction remains uncertified until at least one screenshot with all three reroll cards visible is added.
