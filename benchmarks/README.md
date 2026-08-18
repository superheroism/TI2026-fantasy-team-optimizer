# Benchmarks

This directory contains benchmark evidence that still supports the current product.

## Current files

- `m6d-expanded-adaptive-candidates.json` and `m6d-selection.json` are **build inputs**. `scripts/generate-m6e-policy.mjs` uses them to regenerate the certified five-emblem, two-spend search policy. Do not archive or edit them without recertifying that policy.
- `m6f-browser-performance.json` records the browser responsiveness baseline.
- `m7b-v1-production-baseline.json` records the current supported-route performance baseline.
- `v1-worker-memory-soak.json` records the worker memory-soak baseline.

Historical calibration, holdout, and profiling results live in `archive/`. They explain past engineering decisions but are not build or test inputs.

Use `npm run benchmark` for the broad current benchmark and `npm run benchmark:v1` for the supported-route baseline.