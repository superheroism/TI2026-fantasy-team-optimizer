# P52E — Production-Equivalent Screenshot Import Certification Results

Date: 2026-08-17

Base SHA: `677f17b38d7aba89308b182017ca6118e5236814`

Authoritative corrected measurement SHA: `50f57e73a752608014f945524ce529c530b8432b`

Status: **P52E measurement package complete. Product certification FAILS.**

## Measurement authority

The OCR-core corpus remains a parser diagnostic. The authoritative product measurement is the browser path through the actual `docs/index.html`, the real `#screenshot-file` input, `requestScreenshotImport()`, `validateScreenshotImport()`, `state.importScreenshot(...)`, rerendering, and review highlighting.

The browser harness establishes a deliberately nonmatching sentinel board/menu/token state before each import so preserved values cannot accidentally pass as screenshot truth. The six source images are pinned by dimensions, byte size, MIME type, and SHA-256; the harness fails if the committed bytes change.

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
- Support team: expected `Team Liquid`, raw/applied `OG`, confidence `0.735`;
- token: correct (`22`);
- all three raw action IDs: correct;
- raw action confidence: `0.000`, `0.850`, `0.850`;
- all three actions are below the `0.90` application threshold;
- validation therefore preserves all three sentinel menu actions;
- final canonical correctness: **49/53 fields**;
- validated state, applied state, and rendered controls agree; no independent apply/render corruption was observed.

### Board 2 cold/warm

| Mode | Import wall time | OCR pipeline | Result |
|---|---:|---:|---|
| Chromium cold | 14.322 s | 12.402 s | same 4 final mismatches |
| Chromium warm-1 | 11.524 s | 11.409 s | same 4 final mismatches |
| Chromium warm-2 | 11.555 s | 11.429 s | same 4 final mismatches |

Warm-worker state saves roughly 2.8 s versus cold startup without changing recognition or divergence paths.

## Board 2 — Firefox

Firefox materially disagrees with Chromium on the same bytes and application artifact.

- all three Board 2 runs fail before a raw screenshot-import trace is produced;
- the application then enters the optional hosted-fallback path;
- because the locally served artifact has no hosted endpoint configured, status becomes `Screenshot recognition failed (404).`;
- corrected Board 2 runs take roughly **26.5–27.0 s** before failing;
- none of the corrected Board 2 runs hit the 30-second outer watchdog.

The current trace does not preserve the underlying local-OCR exception before fallback, so the exact Firefox failure mechanism remains a follow-up diagnostic question rather than a proven root cause.

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
- raw actions: **17/18**;
- final applied actions: **2/18**;
- tokens: **5/6**;
- all raw canonical fields: **255/300 (85.0%)**;
- all final canonical fields: **240/300 (80.0%)**;
- final exact boards: **0/6**.

Exactly **15 raw-correct fields become wrong in final state**, all because correct action IDs are rejected/preserved by validation.

## Chromium latency

| Board | Cold | Warm |
|---|---:|---:|
| 1 | 12.731 s | 10.029 s |
| 2 | 14.322 s | 11.524 s |
| 3 | 13.663 s | 10.875 s |
| 4 | 8.546 s | 5.902 s |
| 5 | 7.624 s | 6.127 s |
| 6 | 12.061 s | 9.355 s |

Worker reuse consistently improves latency by roughly 1.5–2.8 s, but current warm imports are still about 6–12 s in Chromium.

## Firefox full-corpus behavior

There are 13 Firefox imports in the corrected certification run because Board 2 receives an additional warm repeat.

- **2/13** reach raw → validated → applied state: Board 5 cold and warm;
- **11/13** fail before raw output and end in the absent hosted fallback;
- Board 5 takes **20.895 s cold / 20.081 s warm**;
- those two Board 5 runs exhaust the 20-second OCR execution budget and record **6 / 5 internal OCR-call timeouts**, respectively;
- no corrected run hits the 30-second outer watchdog, although earlier P52E attempts did, confirming timing instability near the bound.

Firefox therefore fails product certification even where the outer watchdog does not fire.

## Safety

The production-equivalent harness exposes safety failures that the old raw corpus could not establish:

- invalid OCR geometry in completed Chromium imports: **0**;
- OCR-call timeouts in completed Chromium imports: **0**;
- false-high-confidence errors: **1 unique error** — Board 6 Support team is recognized as `Vici Gaming` at confidence `0.95` instead of expected `TEAM VISION`; it reproduces cold and warm;
- Firefox pre-raw pipeline failures: **11/13**;
- Firefox completed imports with exhausted OCR budget: **2/2**;
- Firefox internal OCR-call timeouts on those completed imports: **6 cold / 5 warm**.

The strict P52E command fails on missing raw/validated/applied stages, outer watchdogs, internal OCR-call timeouts, OCR errors, invalid geometry, exhausted OCR budgets, or false-high-confidence errors. Those criteria remain hard failures in strict mode. For PR #55, the automatic production-E2E check runs the same corpus in report-only mode so these known product failures remain visible in artifacts/results without making the measurement package itself red. `workflow_dispatch` runs the same corpus in strict mode and remains expected to fail until P52F fixes the product.

## Source identity

The committed corpus bytes are now mechanically pinned in `tests/fixtures/screenshot-e2e-ground-truth.json`:

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

`36d1569bea49100b103aeab1c3693dca66f454481c4b24052bccb5fc701ffeda`

Deployment asset parity: **match**.

The manual discrepancy is therefore not explained by a stale deployed OCR asset.

## Certification conclusion

P52E closes the measurement gap. The web product is materially less accurate and less browser-portable than the old OCR-core corpus suggested.

The P52E **work package itself is complete**: the production path is exercised, source bytes are frozen, raw → validated → applied → rendered divergence is attributable, browser/safety timing is bounded, and an automatic production-E2E baseline check plus manually dispatchable strict gate exist. Product certification remains **FAIL** in the authoritative result; that failure is a property of the current product baseline, not unfinished measurement infrastructure and not a reason for the P52E PR check itself to be red.

## Recommended next package

**P52F — Browser parity and high-precision auto-apply.**

Primary objective: raise production-E2E accuracy first, then reduce latency without sacrificing the corrected accuracy/safety gates.

Recommended priority:

1. preserve and expose the underlying local-OCR exception before hosted fallback, then resolve Firefox runtime/worker parity;
2. replace team matching's single-best fuzzy score with candidate-margin and roster-consistency evidence; eliminate the Board 6 false-high-confidence team mapping;
3. add structured action evidence/margin so correct closed-catalog actions can exceed the application threshold without globally lowering the 0.90 safety threshold;
4. correct the remaining Board 2/5/6 team errors and Board 4 extraction failure class;
5. only after accuracy gates are green, profile OCR calls and remove/batch redundant recognition work;
6. retain warm-worker reuse and evaluate idle prewarming/self-hosted OCR assets as latency improvements that do not weaken recognition.
