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

## M1 benchmark protocol

Run the human-readable benchmark:

```text
npm run benchmark
```

Write a machine-readable report:

```text
npm run benchmark -- --json=m1-benchmark.json
```

M1 reports both cold and warm optimizer calls and adds throughput context for the selected-board and team-comparison workloads. It does **not** set CI performance thresholds because shared-runner timing variance would create a noisy gate. Later milestones should compare benchmark reports on consistent hardware before accepting a performance-sensitive change.

## Why the search is faster than the histogram

The full selected-board distribution is rebuilt at presentation quality when the optimizer runs. Team-role comparisons are cached by banner mechanics, so selecting a different already-simulated team can reuse those samples.

The action search is cheaper because it:

1. prepares quantile ladders and correlation factorizations once;
2. reuses common random outcomes across hypothetical banner states;
3. uses a specialized best-two-games / best-series scoring path;
4. caches per-role and title-prefix frontiers;
5. fully enumerates immediate action outcomes;
6. applies deterministic stratification only to the second-step continuation calculation.

The future menu distribution itself is not sampled down: all 1,140 menus remain in the continuation model.

## M1 semantic note

Target-probability mode now optimizes free roster/title selection for the target probability itself. This is intentionally a correctness-first change; its runtime should be measured against the frozen pre-M1 target-probability baseline before later performance work. M3/M4 are the planned milestones for structural target-search and DP speedups.

## Interpretation

The runtime approximation affects the depth-two continuation estimate, not the legal action set or immediate reroll probabilities. If two actions are nearly tied, the displayed confidence should reflect that sensitivity rather than implying false precision.
