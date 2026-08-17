# P52E — Production-Equivalent Screenshot Import Certification

Date: 2026-08-17

Base SHA: `677f17b38d7aba89308b182017ca6118e5236814`

Status: **Complete — measurement infrastructure certified; product gate failing on real defects.**

## Measurement authority

P52E separates two different measurements that were previously conflated:

- **OCR-core corpus** — diagnostic measurement of raw OCR/parser output from `requestScreenshotImport()`.
- **Production E2E corpus** — authoritative product measurement through the real `docs/index.html` application, file input, validation, application state import, rerender, and review UI.

Raw OCR/parser exactness is a diagnostic metric. Production E2E exactness is the authoritative screenshot-import product metric.

The Production E2E comparator scores, where applicable:

1. layout;
2. selected team for Core, Mid, and Support;
3. every emblem stat, quality tier, and trait;
4. all three final applied operation IDs;
5. token count;
6. review highlighting/status behavior;
7. parity between applied application state and rendered controls.

Every final mismatch is traced to the first stage where it diverged: raw OCR, validation, application state, or render.

## Frozen PR #53 OCR-core reference

The immutable kickoff control was run from `677f17b38d7aba89308b182017ca6118e5236814` before any P52E observability changes.

| Board | Raw result | Elapsed | OCR timeout | Invalid ROI |
|---|---|---:|---:|---:|
| 1 | exact | 11.696 s | 0 | 0 |
| 2 | exact: 15/15 stats, 15/15 tiers, 15/15 traits, 3/3 actions, tokens exact | 11.860 s | 0 | 0 |
| 3 | exact | 11.061 s | 0 | 0 |
| 4 | 2/15 stats, 2/15 tiers, 4/15 traits, 2/3 actions, token incorrect | 5.468 s | 0 | 0 |
| 5 | 8/9 stats, 9/9 tiers, 9/9 traits, 3/3 actions, token exact | 6.193 s | 0 | 0 |
| 6 | 15/15 stats, 14/15 tiers, 15/15 traits, 3/3 actions, token exact | 9.274 s | 0 | 0 |

Summary: 3/6 raw-exact boards, 6/6 layouts, 0 false-high-confidence errors, 0 invalid OCR geometry, and 0 OCR timeouts.

This reference does **not** establish product exactness because it did not score selected teams or the post-validation/applied/rendered state.

## Production E2E design

The certification runner serves `docs/` as the site root and loads the actual `docs/index.html` application. Before each import it creates a deterministic sentinel board/menu/token state deliberately different from screenshot truth. It then supplies the committed corpus image through the real hidden `#screenshot-file` input.

A disabled-by-default test observer records:

```text
RAW OCR
  ↓
VALIDATED IMPORT
  ↓
APPLIED APPLICATION STATE
  ↓
RENDERED UI
```

The observer is installed only by the E2E harness and does not send telemetry, persist screenshot content, or change production semantics.

Chromium and Firefox are both tested. Board 2 is run once in a fresh context and twice again with the OCR worker warm in the same session. Each import has a 30-second outer browser watchdog. Source image identity is pinned by dimensions, byte size, MIME type, and SHA-256.

The strict gate fails on:

- missing raw, validated, or applied stages;
- outer browser watchdogs;
- internal OCR-call timeouts;
- OCR errors;
- invalid OCR geometry;
- exhausted OCR execution budgets;
- false-high-confidence recognition errors.

The same expensive corpus is not run twice automatically: the strict workflow is the PR gate, while the report-only workflow remains available for manual diagnostics.

## Certified result

The authoritative corrected run is recorded in `P52E_PRODUCTION_E2E_CERTIFICATION_RESULTS.md`.

Key findings:

- Chromium cold final-state accuracy: **240/300 canonical fields (80.0%)**;
- Chromium raw accuracy: **255/300 (85.0%)**;
- **15 raw-correct fields become wrong in final state**, all action IDs rejected/preserved by validation;
- Board 2: **52/53 raw**, **49/53 final**; one Support-team OCR error plus three correct actions rejected by validation;
- Board 6 contains a reproducible false-high-confidence Support-team mapping (`Vici Gaming` at 0.95 instead of `TEAM VISION`);
- Firefox reaches raw → validated → applied state in only **2/13** imports; the two completed Board-5 imports exhaust the 20-second OCR budget and contain internal OCR-call timeouts;
- deployment asset hashes match, so stale GitHub Pages OCR code is not the cause.

## P52E outcome

P52E is complete as a measurement/certification milestone. Its product certification outcome is **FAIL**, because the real product currently violates browser-parity and false-high-confidence safety gates.

Those failures are intentionally left visible for the next implementation package; P52E does not change OCR recognition rules, confidence thresholds, team matching, or fallback semantics in order to manufacture a green result.

## Follow-up

Recommended next work package: **P52F — Browser parity and high-precision auto-apply**.

Accuracy is the first gate. Latency work should then reduce OCR wall time while preserving or improving the frozen P52E production-E2E accuracy and safety metrics.
