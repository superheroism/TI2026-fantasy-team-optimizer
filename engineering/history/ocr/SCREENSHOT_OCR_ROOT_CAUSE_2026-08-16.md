# Screenshot OCR Geometry / Extraction Root Cause — 2026-08-16

## Fixture

Browser-authoritative diagnostic from the known 2560×1600 live corpus fixture.

## Finding

The first localization pass did not establish the board columns and used the explicit equal-third fallback. That fallback was visible in diagnostics and therefore remains a geometry-confidence concern.

However, the cropped extraction pass subsequently recovered a coherent three-column card lattice using repeated card-anchor clustering:

- extraction centers ≈ 486, 913, 1256 on a 1440 px canvas;
- global row centers ≈ 35, 108, 182;
- inferred layout = `legacy_3`;
- no rows were synthesized.

The first material structured-value failure occurred after that geometry had recovered: emblem extraction flattened all OCR words in an emblem ROI into one unordered string, then fuzzy-matched that whole string independently against the stat, trait, and tier domains.

This discarded strong local evidence already present in OCR (`DEATHS`, `GPM`, `FRIENDLY`, `VAMPIRIC`) by diluting exact tokens with unrelated card text.

It also produced a safety-critical false-high-confidence tier error. The quality parser searched the whole card text for `10|30|60|100|150%` without numeric boundaries. On the Support first card, OCR contained `130%`; the parser matched the `30%` suffix inside `130%` and returned Tier II with confidence 0.99 even though that number was the card's displayed stat multiplier, not a quality bonus.

## Architectural correction

1. Preserve the recovered board lattice.
2. Parse emblem fields from local line/token candidates inside each card rather than from the whole flattened card string.
3. Restrict quality evidence to the TIER line / Roman numeral / bounded quality-bonus tokens.
4. Never match a quality bonus as a substring of a larger percentage.
5. Keep whole-card text only as diagnostic context, not primary field evidence.
6. Continue propagating localization fallback as geometric uncertainty; do not convert the equal-third fallback into trusted geometry.

This correction is smaller and better supported by the live trace than retuning OCR thresholds or replacing the extraction lattice that already recovered the board structure.
