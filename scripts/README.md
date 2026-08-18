# Scripts

This directory contains tools used by the current build, tests, certification, or performance workflow.

## Build and verification

- `build.mjs` builds TypeScript and assembles the committed GitHub Pages artifact in `docs/`.
- `clean.mjs` removes generated output.
- `verify-generated.mjs` checks that committed generated files match canonical source.
- `generate-m6e-policy.mjs` regenerates the certified expanded-board search policy from the two retained M6D certification artifacts.

## Tests and browser checks

The screenshot corpus and end-to-end scripts support the current import pipeline and release checks.

## Performance

`benchmark.mjs`, the v1 production-route benchmark, browser benchmark, state/scenario diagnostics, and worker-memory benchmark remain current tools.

Milestone-specific experiment runners were removed after dependency review. Their results remain in `benchmarks/archive/`, their conclusions remain in `engineering/history/`, and the original scripts remain available through Git history.