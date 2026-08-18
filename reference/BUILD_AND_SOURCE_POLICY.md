# Build and source files

The repository has one editable source of truth. Generated files remain committed because the current GitHub Pages deployment uses them, but they are not separate implementations.

## Edit these files

- `src/` — TypeScript application and optimizer code.
- `site/` — static HTML and CSS source.
- `data/` — statistical and title-model inputs.
- `scripts/` — active build, verification, test, and benchmark tools.
- `tests/` — regression, integration, browser, and corpus tests.

## Generated files

- `build/` — compiled JavaScript from `src/`.
- `docs/` — GitHub Pages output assembled from source files and data.

Despite its name, `docs/` is currently a deployment directory, not the documentation source.

Do not hand-edit `build/` or generated JavaScript under `docs/`. Make application changes in `src/`, then rebuild.

A root-level `js/` directory is not supported. Verification rejects it to prevent an accidental third generated tree.

## Required checks

```bash
npm run typecheck
npm test
npm run verify:generated
```

`verify:generated` performs a clean build and checks that committed generated files match the canonical inputs.

CI runs the same core contract through `npm run test:ci`.

If a source change affects compiled or deployed output, commit the regenerated `build/` and `docs/` files with the source change.

## Deployment directory

Moving GitHub Pages output from `docs/` to a clearer name such as `dist/` would improve repository readability, but it also changes deployment configuration and generated-file tooling. Treat that as a separate migration rather than mixing it with documentation cleanup.

## Historical engineering files

Milestone-specific experiments, benchmark outputs, and one-off research tools are historical evidence rather than current product documentation. Keep active build and release tooling easy to find; archive historical material under the existing engineering history or benchmark archive when it is no longer part of the supported workflow.