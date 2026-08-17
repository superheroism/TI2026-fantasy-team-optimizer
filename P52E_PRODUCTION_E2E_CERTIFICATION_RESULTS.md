# P52E — Production-Equivalent Screenshot Import Certification Results

Date: 2026-08-17

Base SHA: `677f17b38d7aba89308b182017ca6118e5236814`

Measured production-E2E SHA: `68ae2748c3d12b1e9d24a0e8b0a15f91776738d2`

## Measurement authority

The OCR-core corpus remains a parser diagnostic. The authoritative product measurement is the browser path through the actual `docs/index.html`, the real `#screenshot-file` input, `requestScreenshotImport()`, `validateScreenshotImport()`, `state.importScreenshot(...)`, rerendering, and review highlighting.

The browser harness establishes a deliberately nonmatching sentinel board/menu/token state before each import so preserved values cannot accidentally pass as screenshot truth.

## Frozen OCR-core reference

PR #53 (`677f17b...`) reported:

| Board | Raw OCR-core result | Elapsed |
|---|---|---:|
| 1 | exact | 11.696 s |
| 2 | exact | 11.860 s |
| 3 | exact | 11.061 s |
| 4 | 2/15 stats, 2/15 tiers, 4/15 traits, 2/3 actions, token incorrect | 5.468 s |
| 5 | 8/9 stats, 9/9 tiers, 9/9 traits, 3/3 actions, token exact | 6.193 s |
| 6 | 15/15 stats, 14/15 tiers, 15/15 traits, 3/3 actions, token exact | 9.274 s |

Summary: 3/6 raw-exact boards, 6/6 layouts, 0 invalid OCR geometry, and 0 OCR timeouts. Selected teams and final validated/applied/rendered state were not part of that acceptance surface.

## Board 2 — Chromium

Board 2 is not product-exact even though the OCR-core corpus called it exact.

Using the model's canonical `TEAM VISION` team ID:

- raw canonical correctness: **52/53 fields**;
- all 45 emblem stat/tier/trait fields: **45/45**;
- selected teams: **2/3**;
- Support team: expected `Team Liquid`, raw/applied `OG`;
- token: correct (`22`);
- all three raw action IDs: correct;
- raw action confidence: `0.000`, `0.850`, `0.850`;
- all three actions are below the `0.90` review threshold;
- validation therefore preserves all three sentinel menu actions;
- final canonical correctness: **49/53 fields**;
- validated state, applied state, and rendered controls agree; no independent apply/render corruption was observed.

All 52 confidence-bearing fields on Board 2 are below 0.90, so the UI places essentially the whole import into review state. This explains why manual web use appeared materially worse than the old raw-corpus result.

### Board 2 cold/warm

| Mode | Import wall time | OCR pipeline | Result |
|---|---:|---:|---|
| Chromium cold | 15.351 s | 12.902 s | same 4 final mismatches |
| Chromium warm-1 | 12.173 s | 12.031 s | same 4 final mismatches |
| Chromium warm-2 | 12.183 s | 11.999 s | same 4 final mismatches |

Warm-worker state improves latency by roughly 3.2 s versus cold startup but does not change recognition or divergence paths.

## Board 2 — Firefox

Firefox materially disagrees with Chromium on the same bytes and production artifact.

- no Board 2 run reaches the raw screenshot-import trace;
- local browser OCR fails before a raw result is returned;
- the application then enters the optional hosted-fallback path;
- because the locally served production artifact has no hosted endpoint configured, status becomes `Screenshot recognition failed (404).`;
- Board 2 cold reaches the 30-second outer watchdog;
- warm repeats still fail and do not recover recognition.

Across the full Firefox corpus, **13/13 imports fail before raw output** and **6/13 hit the 30-second browser watchdog** in the measured certification run.

## Board 2 root cause

**Outcome F — Mixed.**

1. `RAW_OCR_ERROR`: Support team resolves to `OG` instead of `Team Liquid`.
2. `VALIDATION_REJECTED_CORRECT_RAW_VALUE`: all three raw-correct actions are below 0.90 and the validator preserves the sentinel menu.
3. Browser-specific failure: Firefox fails before raw import and falls into the absent hosted fallback.
4. Apply/render: no independent Chromium apply/render mismatch observed.
5. Deployment: not implicated; local and deployed OCR asset hashes match.

## Full-corpus Chromium final-state accuracy

One cold run per board, including selected-team correctness:

| Board | Teams | Stats | Tiers | Traits | Final actions | Token | Final exact |
|---|---:|---:|---:|---:|---:|---:|---|
| 1 | 3/3 | 15/15 | 15/15 | 15/15 | 0/3 | 1/1 | no |
| 2 | 2/3 | 15/15 | 15/15 | 15/15 | 0/3 | 1/1 | no |
| 3 | 3/3 | 15/15 | 15/15 | 15/15 | 0/3 | 1/1 | no |
| 4 | 3/3 | 2/15 | 2/15 | 4/15 | 0/3 | 0/1 | no |
| 5 | 2/3 | 8/9 | 9/9 | 9/9 | 2/3 | 1/1 | no |
| 6 | 1/3 | 15/15 | 14/15 | 15/15 | 0/3 | 1/1 | no |

Aggregate Chromium cold-run accuracy:

- layout: **6/6**;
- selected teams: **14/18**;
- stats: **70/84**;
- tiers: **70/84**;
- traits: **73/84**;
- final applied actions: **2/18**;
- tokens: **5/6**;
- all canonical fields: **240/300 (80.0%)**;
- final exact boards: **0/6**.

Raw Chromium accuracy over the same canonical fields is **255/300 (85.0%)**. Exactly **15 raw-correct fields become wrong in final state**, all because correct action IDs are rejected/preserved by validation.

Firefox reaches final applied state for **0/6 boards**.

## Safety

The production-equivalent harness exposes safety failures that the old raw corpus could not establish:

- invalid OCR geometry in completed Chromium imports: **0**;
- OCR-call timeouts in completed Chromium imports: **0**;
- false-high-confidence errors: **1 unique error** — Board 6 Support team is recognized as `Vici Gaming` at confidence `0.95` instead of expected `TEAM VISION`; it reproduces cold and warm;
- Firefox pipeline failures: **13/13**;
- Firefox outer-watchdog failures: **6/13**.

These are hard failures. They must not be normalized into a passing baseline.

## Source identity

The committed corpus bytes used by certification are pinned as follows:

| Board | Dimensions | Bytes | SHA-256 |
|---|---:|---:|---|
| 1 | 3719×1827 | 4,599,750 | `e375d1429c0d6adf0bc69b5d025d041f09dac9de47dd20b76dc2f5f079693a04` |
| 2 | 3839×2159 | 5,692,486 | `c0438b4bfdb0b260242eb84f6cac068594680f621360e76601cae42c5bc05669` |
| 3 | 3839×2159 | 5,488,434 | `f2a9afda5a6bb1eeb2f12269b4ae267e1476705e9b61a563e58c3485f78b5ca8` |
| 4 | 954×672 | 698,936 | `ac07945057ea114d82b18bfd59159ec9cfdcd5eff358070abb56e027f58aa49b` |
| 5 | 1940×1131 | 211,200 | `f9ef6ae7b40dc51e7aa44cb744141e2f908ea7ed937c40d0a2e0bb5ac27622f2` |
| 6 | 2973×1813 | 2,623,183 | `a45f41637f374e23554ca0729cc3bdc150e3715f773a8234799f28bd51210b41` |

## Deployment parity

Local and public GitHub Pages `docs/js/import/localScreenshotOcr.js` both hashed to:

`cbd34b6fa7b76370a51149f02f1b4ad604321b77596ff7d10cab3d1e46c1a3a6`

Deployment asset parity: **match**.

The manual discrepancy is therefore not explained by a stale deployed OCR asset.

## Certification conclusion

P52E closes the measurement gap: the web product is substantially less accurate than the old OCR-core corpus suggested.

The harness itself successfully exercises the real browser/UI path and produces raw → validated → applied → rendered traces. The package must remain draft/unmerged because hard safety conditions are currently red: Firefox production-browser OCR does not complete successfully, and Board 6 contains a reproducible false-high-confidence team mapping.

## Recommended next package

**P52F — Browser OCR parity and confidence/roster calibration.**

Priority order:

1. resolve Firefox local-browser OCR failure/fallback behavior;
2. eliminate the Board 6 false-high-confidence team mapping;
3. calibrate structured evidence for correct action recognition so valid action IDs are not discarded solely because synthesized-row confidence is below 0.90;
4. correct Board 2 Support-team recognition;
5. retain P52E Production E2E as the authoritative acceptance surface throughout.
