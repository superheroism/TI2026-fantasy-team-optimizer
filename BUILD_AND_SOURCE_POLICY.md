# Build and Source Authority

## Canonical inputs

The authoritative editable inputs are:

- `src/` — TypeScript application and optimizer source
- `site/` — static HTML/CSS source
- `data/` — statistical/title/rules data snapshots consumed by the application
- `scripts/` — build, verification, and benchmark tooling
- `tests/` — regression/integration tests

## Generated compatibility trees

The supported generated artifacts are:

- `build/` — TypeScript compiler output; `tsconfig.json` emits application JavaScript to `build/js/`
- `docs/` — GitHub Pages deployment output assembled from `build/js`, `site/`, and `data/`

Do not hand-edit JavaScript under `build/` or `docs/js/`. A change that belongs in the application must be made under `src/` and regenerated with `npm run build`.

A root-level `js/` directory is **not** part of the build or deployment contract. It was a stale compiled snapshot inherited from the repository's initial commit and was removed before v1.0. `/js/` is ignored and reproducibility verification rejects its presence so an accidental compiler invocation cannot silently create a third generated tree.

`docs/` remains committed to preserve the repository's current GitHub Pages deployment contract. A future deployment migration may remove this requirement, but that is intentionally separate from application-source authority.

## Required development checks

```bash
npm run typecheck
npm test
npm run verify:generated
```

`npm run verify:generated` snapshots committed/generated output, rejects unsupported root-level generated output, performs a clean build, confirms the supported generated trees match canonical inputs, and fails if the pre-build generated trees were stale.

## CI contract

CI performs:

```text
TypeScript typecheck
→ generated-artifact reproducibility check
→ Node test suite
```

A source-only change that modifies compiled/deployed output must therefore include the regenerated `build/` and `docs/` artifacts while those directories remain committed.

## Performance baseline

Use:

```bash
npm run benchmark
npm run benchmark -- --json=m1-benchmark.json
```

The JSON form records runtime metadata and individual workload timings so future milestones can compare cold and warm behavior rather than relying on a single anecdotal elapsed time.
