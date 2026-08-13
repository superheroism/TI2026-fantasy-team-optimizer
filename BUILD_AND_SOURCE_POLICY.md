# Build and Source Authority

## Canonical inputs

The authoritative editable inputs are:

- `src/` — TypeScript application and optimizer source
- `site/` — static HTML/CSS source
- `data/` — statistical/title/rules data snapshots consumed by the application
- `scripts/` — build, verification, and benchmark tooling
- `tests/` — regression/integration tests

## Generated compatibility trees

The following are generated artifacts during M1:

- `build/` — TypeScript compiler output
- `docs/` — GitHub Pages deployment output assembled from `build/js`, `site/`, and `data/`

Do not hand-edit JavaScript under `build/` or `docs/js/`. A change that belongs in the application must be made under `src/` and regenerated with `npm run build`.

`docs/` remains committed during M1 to preserve the repository's current GitHub Pages deployment contract. A future deployment migration may remove this requirement, but that is intentionally separate from M1.

## Required development checks

```bash
npm run typecheck
npm test
npm run verify:generated
```

`npm run verify:generated` snapshots committed/generated output, performs a clean build, confirms the generated trees match canonical inputs, and fails if the pre-build generated trees were stale.

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
