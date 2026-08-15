# M5G — Target-Probability t=3 Robustness Validation

## Status

**Measurement in progress.** This package validates the already-frozen M5C-aggressive + M5D-Wide target-probability `t=3` policy; it does not redesign or retune it.

```text
M5G_BASE_SHA = a138a7b968350e97261c2631c8298521d07b72d4
objective = P(final score >= targetScore)
production horizon = 2
experiment horizon = 3
oracle = current fidelity + no widening
candidate = aggressive 4 → 2 → 1 + Wide 12 → 8 → 4
root/current-menu fidelity = full
```

## Frozen corpus

The corpus was fixed before deep measurement: the canonical M5F state plus all eight M5D holdout fixtures generated from seed `20260813`, crossed with targets `50,000`, `55,000`, and `60,000`. This is exactly 9 board/menu states × 3 thresholds = 27 cases. The fixture manifest is `benchmarks/m5g-target-robustness-fixtures.json`.

The canonical board must remain `15394829123847039010`; every M5D holdout is replayed through the existing compact transition model and checked against its frozen final BoardStateID before timing.

## Frozen gate

Outcome A requires all 27 oracles to finish in <600 s, all 27 candidates in <60 s, all completed deep cases below 6 GiB max RSS, all 27 t=2 ranked-table isolation controls to match, all 20 future operation identities to remain present, threshold utilities to be monotone, and the frozen policy-quality gates to pass. Top-action agreement must be at least 26/27; at most one board-action-vs-board-action disagreement can be waived, and only with oracle top-two gap <=1.00 pp and oracle regret <=0.25 pp. Mean regret must be <=0.05 pp and max regret <=0.25 pp. Stop/menu disagreement is never waivable.

The gate implementation and synthetic gate tests were committed before the authoritative deep run. No threshold, fixture, timeout, schedule, scenario budget, target kernel, or gate may be changed after measurement.

## Execution

Authoritative execution uses GitHub Actions on Node 22. Preflight runs dependency installation, typecheck, committed-generated verification, the full test suite, the frozen-plan check, and the canonical M5F 55k reproducibility sentinel before the 27-case matrix. Each matrix cell runs its oracle and candidate on the same runner instance in separate Node processes with clean run-scoped caches and `--expose-gc`.

Production remains capped at `t<=2`; no target `t=3` UI or production path is enabled by M5G.
