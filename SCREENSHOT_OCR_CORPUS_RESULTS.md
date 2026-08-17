# Screenshot Import Corpus — Verification Results

Date: 2026-08-17

## Measurement terminology

Two measurements are intentionally retained:

- **OCR-core**: raw `requestScreenshotImport()` output. Diagnostic only.
- **Production E2E**: final application behavior through the actual `docs/index.html` import path. Authoritative product metric.

Raw OCR/parser exactness is a diagnostic metric. Production E2E exactness is the authoritative screenshot-import product metric.

Historical results that predate P52E measured the former, even where earlier documentation described them as final screenshot-import accuracy. Those results are preserved below rather than rewritten as if they had exercised validation/state/render behavior.

## Frozen OCR-core reference at P52E kickoff

Base SHA: `677f17b38d7aba89308b182017ca6118e5236814` (PR #53 merge).

The six committed real screenshots were run without changing OCR behavior.

| Board | Layout | Stats | Tiers | Traits | Raw actions | Token | Raw exact | Elapsed |
|---|---|---:|---:|---:|---:|---|---|---:|
| 1 | exact | 15/15 | 15/15 | 15/15 | 3/3 | exact | yes | 11.696 s |
| 2 | exact | 15/15 | 15/15 | 15/15 | 3/3 | exact | yes | 11.860 s |
| 3 | exact | 15/15 | 15/15 | 15/15 | 3/3 | exact | yes | 11.061 s |
| 4 | exact | 2/15 | 2/15 | 4/15 | 2/3 | incorrect | no | 5.468 s |
| 5 | exact | 8/9 | 9/9 | 9/9 | 3/3 | exact | no | 6.193 s |
| 6 | exact | 15/15 | 14/15 | 15/15 | 3/3 | exact | no | 9.274 s |

Summary:

- raw-exact boards: **3/6**;
- layouts: **6/6**;
- false-high-confidence errors: **0**;
- invalid OCR geometry: **0**;
- OCR timeouts: **0**;
- aggregate OCR-core elapsed time: **55.552 s**.

Board 2 is the P52E canary because this raw layer reports it exact while manual web use appeared materially worse.

This reference did **not** score selected teams and did **not** pass the result through validation, preservation semantics, `state.importScreenshot`, rerendering, or review highlighting. Therefore `3/6 raw exact` must not be interpreted as `3/6 product exact`.

## Why the previous acceptance surface was insufficient

The earlier OCR-core harness was conceptually:

```text
raw screenshot
    ↓
requestScreenshotImport()
    ↓
raw structured OCR result
    ↓
compare to labels
```

The real product is:

```text
actual docs/index.html
    ↓
real application initialization
    ↓
#screenshot-file
    ↓
requestScreenshotImport()
    ↓
validateScreenshotImport(...)
    ↓
low-confidence preservation / review policy
    ↓
state.importScreenshot(...)
    ↓
renderStructure()
    ↓
review highlighting/status
    ↓
user-visible board/menu/tokens
```

For example, a raw action ID can be correct while confidence is below 0.90. In that case validation may preserve the pre-import action, making the user-visible final action different from screenshot truth. The old raw comparator could count the recognition as correct; P52E correctly scores the final action as wrong and identifies validation as the first divergence.

## P52E Production E2E certification

The browser corpus:

- loads the actual `docs/` artifact;
- drives the real hidden file input;
- begins from a deterministic sentinel state;
- scores selected teams;
- captures raw → validated → applied → rendered stages;
- verifies DOM/state parity and review highlighting;
- runs Chromium and Firefox;
- distinguishes cold and warm OCR-worker behavior;
- mechanically pins source dimensions, byte size, MIME type, and SHA-256;
- uses a 30-second outer watchdog and records internal OCR timeouts/budget exhaustion;
- checks public GitHub Pages OCR-asset parity.

P52E is complete. Final measured results, Board 2 root-cause classification, browser comparison, full-corpus product accuracy, safety failures, timing, and deployment parity are recorded in `P52E_PRODUCTION_E2E_CERTIFICATION_RESULTS.md`.

## Historical OCR/parser lessons retained

Earlier OCR work established several useful parser-level findings that remain valid diagnostic context:

1. role-heading plus repeated-card-anchor localization is more robust than equal-third full-image splitting;
2. pooling `TIER` row geometry across banners prevents some five-to-three layout collapses;
3. source-resolution retry crops are important for difficult multiline stats and reroll cards;
4. Otsu/whiteness preprocessing can recover selected tight stat crops;
5. confidence/review safety is more important than forcing every ambiguous field to a guessed value;
6. browser Tesseract.js latency must not be treated as equivalent to native Tesseract subprocess timing.

Those findings guide OCR diagnosis, but future user-facing acceptance decisions use the Production E2E corpus.
