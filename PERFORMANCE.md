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

## Benchmark

Run:

```text
npm run benchmark
```

Representative cold-cache medians from the current working build:

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

## Interpretation

The runtime approximation affects the depth-two continuation estimate, not the legal action set or immediate reroll probabilities. If two actions are nearly tied, the displayed confidence should reflect that sensitivity rather than implying false precision.
