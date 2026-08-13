# M4 DP Foundation

M4 establishes the finite-horizon policy architecture without increasing the production decision horizon. `ENGINEERING_ROADMAP.md` remains authoritative; this note records the implementation and validation details for the M4 work package.

## Scenario-reuse prerequisite

Before introducing DP, the existing `RawRoleScenario` path was instrumented and measured at optimizer scenario counts 48, 96, 192, and 384 for both objectives.

The raw scenario cache is scoped to a `DataBundle` and keyed by player/profile, role, iteration count, expected series, seed, and raw scenario-generation context. Stat selection, emblem quality, and trait are intentionally absent: the bank contains the complete role stat vector and board mechanics are applied when rescoring it.

### Measured scaling

| Objective | Scenarios | Optimizer time | Raw banks generated | Raw-cache hits | Raw-cache misses |
|---|---:|---:|---:|---:|---:|
| Expected score | 48 | 1.33 s | 48 | 31,712 | 48 |
| Expected score | 96 | 1.42 s | 48 | 31,712 | 48 |
| Expected score | 192 | 1.96 s | 48 | 31,712 | 48 |
| Expected score | 384 | 3.16 s | 48 | 31,712 | 48 |
| Target probability | 48 | 5.36 s | 48 | 32,592 | 48 |
| Target probability | 96 | 9.93 s | 48 | 32,592 | 48 |
| Target probability | 192 | 25.17 s | 48 | 32,592 | 48 |
| Target probability | 384 | 48.78 s | 48 | 32,592 | 48 |

An 8× increase in expected-score scenarios increased wall time by about 2.4× while the number of stochastic scenario generations stayed fixed at 48. Target-probability time grows much more sharply, but its stochastic generation count is equally fixed; the additional cost is downstream target-probability roster/title search rather than regeneration of player scenarios.

A second test warms the original board and then changes a Mid stat, quality, or trait. At 192 scenarios, every changed-board evaluation makes 16 raw-scenario requests, receives 16 cache hits, and performs **zero** new stochastic generations for both objectives. Regression tests now lock this behavior.

`benchmarks/m4-scenario-prerequisite.json` contains the complete measurements. The roadmap Phase-4 prerequisite is therefore satisfied.

## Exact uniform menu operator

The normal menu rule draws three distinct operation identities uniformly from 20. Once the best legal target continuation value for each operation identity is known, explicit enumeration of all

```text
C(20,3) = 1,140
```

menus is unnecessary.

Sort the 20 operation identities by continuation value in ascending order. For 1-based rank `k`, operation `k` is the maximum selected operation exactly when it is selected and the other two identities come from the `k - 1` lower-ranked identities. Its probability of being the maximum is therefore

```text
C(k - 1, 2) / C(20, 3).
```

M4 computes

```text
Σ rankWeight(k) × max(menu-independent baseline, operationValue(k)).
```

The menu-independent baseline includes stop and, when another modeled token spend remains, menu-reroll continuation.

Operation identities remain distinct even when their values tie. A deterministic index tie-break only orders equal-valued identities; because their values are equal, assigning different rank weights does not change the sum. Unavailable operations use `-Infinity` safely behind the finite stop/reroll baseline.

`MenuModel` separates the uniform analytic implementation from `data.menuSamples`. Supplied empirical/non-uniform samples retain the old explicit sample-by-sample evaluation exactly.

### Menu validation and microbenchmark

Tests compare the analytic operator with explicit combination enumeration for random deterministic vectors, increasing/decreasing values, all-equal and heavily tied values, stop-dominant vectors, a single extreme operation, unavailable operations, negative values, and optimizer-generated operation values. Override samples are tested separately.

On the same Node 22 runner, 5,000 analytic operators took 12.3 ms versus 385.8 ms for 5,000 explicit 1,140-menu scans: **31.5× faster**, with a value difference of `5.1e-11` from floating-point summation order. The persisted M4 benchmark on a separate runner measured 34.6×. This is a menu microbenchmark, not a claim of 31× whole-optimizer speedup.

## Finite-horizon value functions

`src/engine/valueFunction.ts` introduces a generic policy engine over caller-supplied state identity, operation identity, transitions, utility, and menu expectation.

```text
S(B) = terminalUtility(B)

A(B,a,t)
  = Σ P(B' | B,a) × V(B',t-1)

R(B,t)
  = V(B,t-1)

Q(B,M,t)
  = max(S(B), R(B,t), actions visible in M)

V(B,t)
  = E_M[Q(B,M,t)]
```

The Dota adapter in `optimizer.ts` supplies compact `BoardStateID` identity, compact transition mechanics, objective-correct scoring, best legal role target selection for each operation identity, and `MenuModel`.

Production remains explicitly capped at **two modeled token spends**. M4 changes the architecture, not the horizon. M5 owns deeper search.

## Fidelity preservation

The pre-M4 two-step optimizer deliberately used asymmetric transition fidelity. M4 preserves it explicitly through an action phase:

| Decision location | Transition treatment |
|---|---|
| Immediate visible-action metrics | full transition distribution |
| First visible action entering continuation | `continuationEntryStrata` |
| Action reached through a fresh menu | `continuationOutcomeStrata` |

The value-function recursion does not silently promote stratified branches to full enumeration or reduce immediate visible metrics. The old two-step implementation is retained inside a regression test as a reference oracle.

## Memoization and identity

All DP/search identity is compact and run-scoped.

Implemented caches include:

- terminal utility by `BoardStateID`;
- `V(BoardStateID,t)`;
- `Q(BoardStateID,menu,t)`;
- operation continuation by board ID, token depth, action phase, and operation identity;
- targeted Dota continuation by board ID, token depth, phase, operation, and role;
- transition distributions by compact board ID, role, and operation;
- objective-specific scalar board utility/materialization caches.

No nested `BoardState` serialization is used for DP identity. Objective, target threshold, simulation fidelity, expected-series context, and other scoring context are immutable for one optimizer invocation, so the DP caches are intentionally scoped to that invocation rather than embedding those fields in every key. This prevents cross-objective reuse by construction.

There is no second standalone cache for the uniform-menu expectation: `V(B,t)` is itself the memoized fresh-menu expectation for exactly that board/depth/context, so a parallel cache would duplicate the same semantic key and value.

Diagnostics now expose V/Q/action/terminal cache hits and misses, unique states and action evaluations by depth, transition evaluations, transition-distribution cache reuse, terminal scoring calls, menu-operator calls/time, and descriptive `BoardState` materializations.

The descriptive boundary remains unchanged: compact state is used through search and transitions; a `BoardState` is materialized only when the existing scoring API requires it, and that materialization is memoized per board ID.

## Objective and policy equivalence

Expected-score and target-probability objectives use the same V/Q recursion. The objective-specific terminal utility callback remains responsible for free roster/title optimization; target mode never substitutes expected score as an intermediate search objective.

Integration tests compare the **full ranked action table** from M4 with a retained pre-M4 reference implementation for:

- expected score, one token;
- expected score, multi-token state;
- target probability, one token;
- target probability, multi-token state;
- explicit `data.menuSamples` override semantics.

They compare action identity, expected-final utility, expected-final score, and tokens-after, with strict numerical tolerance. Recommendations are unchanged.

Synthetic value-function tests also compare complete explicit trees with memoized V/Q at `t = 0`, `1`, and `2`, including stop-dominant, board-action-dominant, menu-reroll-dominant, stochastic, and transposition cases.

## Whole-optimizer benchmark

`benchmarks/m3-postcompact-benchmark.json` remains the immediate historical M3 baseline. Because GitHub runner variation is larger than the M4 changes, a same-runner checkout of current `main` and M4 was also measured sequentially.

| Workload | M3 same runner | M4 same runner | Change | Recommendation |
|---|---:|---:|---:|---|
| Default cold | 1,329.6 ms | 1,276.0 ms | -4.0% | identical |
| Quality-heavy cold | 1,489.1 ms | 1,447.5 ms | -2.8% | identical |
| Stat-heavy cold | 1,357.3 ms | 1,348.0 ms | -0.7% | identical |
| Global-quality cold | 1,244.6 ms | 1,232.2 ms | -1.0% | identical |
| Trait-heavy cold | 1,211.1 ms | 1,186.0 ms | -2.1% | identical |
| Target 55k cold | 5,358.8 ms | 5,362.9 ms | +0.1% | identical |

Expected-score cold cases are modestly faster; target-probability is effectively unchanged. Warm timings are noisier and mixed, ranging from +23% to -28% in this single sequential run. No recommendation changed; utility deltas were at most about `2e-10` for score EV and `2e-15` for target probability.

The persisted standalone M4 report is `benchmarks/m4-dp-foundation-benchmark.json`. It also shows that the normal default optimization invokes the uniform menu operator 48 times, scans **zero explicit menus**, and spends under 0.5 ms total inside the menu operator. This explains why a ~30× menu microbenchmark speedup produces only a modest whole-optimizer change: stochastic/scoring and target-search work still dominate.

## Deliberately deferred to M5

M4 does not introduce:

- production horizon > 2;
- 4/8/full-token policy search;
- probability truncation;
- progressive widening;
- horizon-dependent simulation budgets;
- approximate/interpolated continuation values;
- Web Workers or parallel search;
- adaptive precision.

## Completion assessment

Against `ENGINEERING_ROADMAP.md` and the M4 acceptance criteria:

- reusable common scenarios are empirically verified and regression-tested;
- normal uniform fresh-menu expectation no longer scans 1,140 menus;
- the analytic operator is exhaustively equivalent to explicit enumeration;
- memoized `V` / `Q` architecture is in place on compact state identity;
- production remains capped at two modeled token spends;
- expected-score and target-probability action tables remain equivalent;
- existing continuation stratification is preserved explicitly;
- scoring/UI descriptive boundaries remain intact;
- typecheck, generated-artifact verification, and the full test suite pass;
- benchmarks cover menu microperformance, whole-optimizer cold/warm behavior, DP/cache diagnostics, and scenario reuse/scaling;
- no M5 deep-search technique is introduced.

**M4 — DP Foundation is complete.**

The first bounded M5 package should extend only to a **4-token experimental horizon**, matching the roadmap's `2 → 4 → 8 → practical full horizon` progression. Keep `t <= 2` at current fidelity, add explicit state-growth/memory/runtime diagnostics for `t = 3–4`, validate exact policy equivalence at `t <= 2`, and gate 4-token production use on measured tractability before adding pruning, widening, or more aggressive approximations.
