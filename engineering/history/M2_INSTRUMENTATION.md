# M2 — Search Instrumentation

This patch adds opt-in diagnostics to the exact sampled target-probability search. It does not change optimizer decisions.

## Apply

Overlay this directory onto the repository root, then run:

```powershell
npm run build
npm run typecheck
npm test
npm run verify:generated
node scripts/diagnose-m2.mjs
```

For machine-readable output:

```powershell
node scripts/diagnose-m2.mjs --json
```

## Metrics

- unique target-board evaluations and board-cache hits;
- prepared-role cache hits/misses;
- average candidates before/after safe dominance pruning by role;
- prefix, Core, and Core+Mid branch-and-bound pruning;
- full roster triples considered/completed/early-terminated;
- scenario checks;
- candidate-preparation and combinatorial-search timing.

Diagnostics are disabled by default and only mutate counters when explicitly enabled.
