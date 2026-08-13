# Performance Notes

The optimizer uses different simulation budgets for presentation and search. The goal is to keep the board distribution informative while making the next-action recommendation fast enough to use between rolls.

## Current configuration

| Component | Configuration |
|---|---:|
| Selected-board score distribution | 20,000 simulations |
| Team comparison | 6,000 simulations per team |
| Reroll-search scenarios | 48 common raw scenarios per team/role bank |
| Decision lookahead | maximum 2 token spends |
| Immediate visible-action transitions | fully enumerated |
| First-step continuation entry | up to 12 deterministic probability strata |
| Fresh-menu future-action outcomes | up to 8 strata per action/role |
| Uniform future menu | exact combinatorial best-of-3 operator over 20 operation identities |
| Empirical/non-uniform menu override | explicit `data.menuSamples` evaluation |

## Frozen pre-M1 baseline

Representative cold-cache medians documented immediately before M1:

| Workload | Median |
|---|---:|
| Selected setup, 20,000 simulations | ~0.26 s |
| Core comparison, 6,000 simulations/team | ~0.36 s |
| Default two-step reroll menu | ~1.13 s |
| Quality-heavy menu | ~1.35 s |
| Stat-heavy menu | ~1.18 s |
| Trait-heavy menu | ~1.06 s |
| Target-probability objective | ~1.26 s |

These are build-environment timings, not browser guarantees. Hardware, browser, cache state, and the current menu can all change runtime.

The same baseline is frozen in machine-readable form at `benchmarks/m1-prechange-baseline.json`.

## Benchmark protocol

Run the human-readable benchmark:

```text
npm run benchmark
```

Write a machine-readable report:

```text
npm run benchmark -- --json=benchmark.json
```

The benchmark reports cold and warm optimizer calls and throughput context for selected-board and team-comparison workloads. M3 added transition reference/cold/warm throughput, transition-cache diagnostics, and a descriptive-board allocation proxy. M4 adds the exact-menu microbenchmark, raw-scenario reuse diagnostics, and V/Q/search diagnostics. CI does **not** enforce timing thresholds because shared-runner variance would create a noisy gate; compare before/after reports from the same machine/runtime.

## M3 compact-transition benchmark

`benchmarks/m3-precompact-baseline.json` and `benchmarks/m3-postcompact-benchmark.json` were produced sequentially on the same Node 22 GitHub runner around the compact-transition change.

| Workload | Before | After | Change |
|---|---:|---:|---:|
| Cold transition suite, 60 operation-role calls | 4.09 ms | 3.29 ms | -19.6% |
| Default optimizer cold | 1,253 ms | 1,080 ms | -13.8% |
| Quality-heavy optimizer cold | 1,357 ms | 1,195 ms | -12.0% |
| Stat-heavy optimizer cold | 1,210 ms | 1,096 ms | -9.4% |
| Global-quality optimizer cold | 1,164 ms | 1,021 ms | -12.3% |
| Trait-heavy optimizer cold | 1,069 ms | 994 ms | -7.0% |
| Target-55k optimizer cold | 4,962 ms | 4,727 ms | -4.8% |

Recommendations and utilities were identical in every established optimizer case. The compact warm transition cache served 15,000 operation-role calls in 28.5 ms with 15,000 hits, zero misses, and zero new transition calculations.

The transition allocation proxy changed from 362 descriptive final `BoardState` outcomes for the reference suite (not counting its recursive intermediate board clones) to **zero descriptive `BoardState` allocations inside compact transition enumeration**. The optimizer separately counts descriptive boards materialized at the scoring boundary, so this should not be read as zero allocation for the entire optimizer.

## M4 DP-foundation benchmark

M4 replaces explicit uniform future-menu enumeration with an exact combinatorial operator and routes the existing two-spend policy through memoized `V(B,t)` / `Q(B,M,t)`. It does **not** increase search depth.

The menu operator was benchmarked separately from the optimizer. On one same-runner comparison, 5,000 exact analytic operators took 12.3 ms versus 385.8 ms for 5,000 explicit scans of all 1,140 menus: **31.5× faster**. The persisted M4 benchmark measured 34.6×. The analytic and explicit values differed only by floating-point summation order (`~5e-11`).

A same-runner checkout of M3 `main` and M4 produced:

| Workload | M3 | M4 | Change |
|---|---:|---:|---:|
| Default optimizer cold | 1,329.6 ms | 1,276.0 ms | -4.0% |
| Quality-heavy optimizer cold | 1,489.1 ms | 1,447.5 ms | -2.8% |
| Stat-heavy optimizer cold | 1,357.3 ms | 1,348.0 ms | -0.7% |
| Global-quality optimizer cold | 1,244.6 ms | 1,232.2 ms | -1.0% |
| Trait-heavy optimizer cold | 1,211.1 ms | 1,186.0 ms | -2.1% |
| Target-55k optimizer cold | 5,358.8 ms | 5,362.9 ms | +0.1% |

Recommendations were identical. Score-utility deltas were at most about `2e-10`, and target-probability delta was about `2e-15`. Warm timings were mixed in the single sequential run, so they should not be overinterpreted.

`benchmarks/m4-dp-foundation-benchmark.json` contains the normal M4 benchmark and cache diagnostics. In its default cold optimizer run, the uniform menu operator was called 48 times, scanned **zero explicit menus**, and consumed less than 0.5 ms total. The ~30× menu microbenchmark speedup therefore translates to only a modest whole-optimizer improvement because scoring/search work dominates.

## Reusable-scenario prerequisite

`benchmarks/m4-scenario-prerequisite.json` measures optimizer scenario counts 48 → 96 → 192 → 384 for expected-score and target-probability modes.

The number of stochastic raw-role banks generated remains fixed at **48** at every scenario count. Expected-score wall time rises from about 1.33 s to 3.16 s for an 8× scenario increase. Target probability rises from about 5.36 s to 48.78 s, but it also keeps exactly 48 raw generations; the extra cost is downstream target search.

After warming the base board, isolated stat, quality, and trait changes at 192 scenarios each make 16 raw-scenario requests with **16 hits, zero misses, and zero new generations** for both objectives. This confirms that competing board states reuse the same underlying player-performance scenarios rather than regenerating them.

## Why the search is faster than the histogram

The full selected-board distribution is rebuilt at presentation quality when the optimizer runs. Team-role comparisons are cached by banner mechanics, so selecting a different already-simulated team can reuse those samples.

The action search is cheaper because it:

1. generates complete raw role-stat scenario banks and reuses them across stat/quality/trait board changes;
2. uses typed arrays and specialized retained-game scoring paths;
3. caches per-role and title-prefix frontiers;
4. fully enumerates immediate visible-action outcomes;
5. preserves deterministic probability stratification only in continuation branches;
6. carries compact canonical board/banner IDs through transition/search;
7. caches compact transition distributions;
8. memoizes terminal utility, action continuation, `V(B,t)`, and `Q(B,M,t)`;
9. computes uniform fresh-menu expectation analytically instead of scanning 1,140 menus.

The uniform future-menu distribution is still modeled **exactly**; M4 changes the calculation, not the probability model. Explicit `data.menuSamples` overrides continue to be evaluated as supplied.

## Semantic note

Target-probability mode optimizes free roster/title selection for the target probability itself. The same finite-horizon value-function machinery is used for both objectives; expected score is not used as an intermediate objective in target mode.

The production decision horizon remains capped at two token spends. M5 owns deeper finite-horizon search and must validate state growth and policy stability before moving from 2 → 4 → 8 or toward the practical remaining-token horizon.

## Interpretation

The runtime approximation affects continuation fidelity, not the legal action set or immediate reroll probabilities. If two actions are nearly tied, the displayed confidence should reflect that sensitivity rather than implying false precision.
