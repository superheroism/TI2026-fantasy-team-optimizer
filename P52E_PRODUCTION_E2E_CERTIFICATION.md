# P52E — Production-Equivalent Screenshot Import Certification

Date: 2026-08-17

Base SHA: `677f17b38d7aba89308b182017ca6118e5236814`

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

Chromium and Firefox are both tested. Board 2 is run once in a fresh context and twice again with the OCR worker warm in the same session. Each import has a 30-second outer browser watchdog.

## Board 2 diagnosis

Certification results will be recorded here from the machine-readable browser report once the production-path run completes successfully.

## Full-corpus result

Certification results will be recorded here from the machine-readable browser report once the production-path run completes successfully.

## Deployment parity

The certification runner compares the byte hash of local `docs/js/import/localScreenshotOcr.js` with the public GitHub Pages copy. This is diagnostic because Pages deployment can lag a merge.

## Follow-up

The next work package is selected only after Board 2's first-divergence evidence identifies whether the discrepancy is primarily raw OCR, confidence/validation, apply/render, browser-specific, deployment-specific, or mixed.
