# Build and Source Authority

This repository has one editable source of truth. Generated files are committed for deployment compatibility, but they are not independent implementations.

## Editable source

- `src/` — TypeScript application and optimizer code
- `site/` — static HTML/CSS
- `data/` — statistical and title-model inputs
- `scripts/` — build, verification, and benchmark tools
- `tests/` — regression and integration tests

## Generated output

- `build/` — compiled JavaScript from `src/`
- `docs/` — GitHub Pages output assembled from `build/`, `site/`, and `data/`

Do not hand-edit `build/` or `docs/js/`. Make application changes in `src/`, then run the build.

A root-level `js/` directory is not supported. An old compiled snapshot once lived there; it was removed before v1.0. Verification now rejects `/js/` so an accidental compiler run cannot create a third generated tree.

`docs/` remains committed because GitHub Pages currently deploys from it. Changing that deployment model is a separate project decision.

## Required checks

```bash
npm run typecheck
npm test
npm run verify:generated
```

`verify:generated` performs a clean build and checks that committed generated files match the canonical inputs. It also rejects unsupported generated output.

CI runs the same contract:

```text
typecheck → generated-file verification → tests
```

If a source change affects compiled or deployed output, commit the regenerated `build/` and `docs/` files as well.

## Performance baseline

```bash
npm run benchmark
npm run benchmark -- --json=m1-benchmark.json
```

The JSON report records runtime metadata and per-workload timings so later changes can be compared on the same machine/runtime instead of relying on a single elapsed-time number.