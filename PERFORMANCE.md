# Performance Notes

The optimizer uses different simulation budgets for presentation and search. The goal is to keep the board distribution informative while making the next-action recommendation fast enough to use between rolls.

## Current configuration

| Component | Configuration |
|---|---:|
| Selected-board score distribution | 20,000 simulations |
| Team comparison | 6,000 simulations per team |
| Reroll-search scenarios | 48 common-random-number scenarios per team/banner state |
| Decision lookahead | maximum 2 token spends |
| Immediate visible-action transitions | fully enumerated |
| Second-step continuation entry | up to 12 deterministic probability strata |
| Second-step future outcomes | up to 8 strata per action/role |
| Future menu distribution | all 1,140 three-action menus retained |

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

The benchmark reports cold and warm optimizer calls and throughput context for selected-board and team-comparison workloads. M3 additionally reports transition reference/cold/warm throughput, transition-cache diagnostics, and a descriptive-board allocation proxy. CI does **not** enforce timing thresholds because shared-runner variance would create a noisy gate; compare before/after reports from the same machine/runtime.

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

Warm whole-optimizer timings improved much more than cold timings, but they combine compact transition-cache reuse with pre-existing scoring caches and therefore are not transition-only speedups.

## Why the search is faster than the histogram

The full selected-board distribution is rebuilt at presentation quality when the optimizer runs. Team-role comparisons are cached by banner mechanics, so selecting a different already-simulated team can reuse those samples.

The action search is cheaper because it:

1. prepares quantile ladders and correlation factorizations once;
2. reuses common random outcomes across hypothetical banner states;
3. uses a specialized best-two-games / best-series scoring path;
4. caches per-role and title-prefix frontiers;
5. fully enumerates immediate action outcomes;
6. applies deterministic stratification only to the second-step continuation calculation;
7. carries compact canonical board/banner IDs through transition/search and caches banner transition distributions.

The future menu distribution itself is not sampled down: all 1,140 menus remain in the continuation model.

## M1 semantic note

Target-probability mode optimizes free roster/title selection for the target probability itself. This remains a correctness-first path and is materially more expensive than expected-score search. M3 reduces state/transition overhead without changing that target-search semantics.

## Interpretation

The runtime approximation affects the depth-two continuation estimate, not the legal action set or immediate reroll probabilities. If two actions are nearly tied, the displayed confidence should reflect that sensitivity rather than implying false precision.
