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

Run the bounded M5A horizon experiment:

```text
npm run benchmark:m5 -- --json=benchmarks/m5-four-token-experiment.json
```

The benchmark reports cold and warm optimizer calls and throughput context for selected-board and team-comparison workloads. M3 added transition reference/cold/warm throughput, transition-cache diagnostics, and a descriptive-board allocation proxy. M4 adds the exact-menu microbenchmark, raw-scenario reuse diagnostics, and V/Q/search diagnostics. M5A adds per-depth V/Q/action state growth, run-scoped cache growth, memory snapshots, and isolated `t=2/3/4` cases. CI does **not** enforce timing thresholds because shared-runner variance would create a noisy gate; compare before/after reports from the same machine/runtime.

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

## M5A four-token experiment

M5A exposes the existing M4 V/Q architecture to an **engineering-only** finite-horizon override while leaving normal application calls capped at two modeled token spends. No horizon-dependent fidelity reduction or approximation was introduced.

`benchmarks/m5-four-token-experiment.json` was produced on Node 22/Linux with a 60-second ceiling for each isolated realistic case.

| Workload | t=2 cold | t=3 cold | t=4 |
|---|---:|---:|---:|
| Default | 1.57 s | 22.85 s | >60 s |
| Quality-heavy | 1.66 s | 28.21 s | >60 s |
| Stat-heavy | 1.59 s | 27.49 s | >60 s |
| Trait-heavy | ~1.30 s | 23.31 s | >60 s |
| Global-quality | ~1.43 s | 23.40 s | >60 s |
| Target-55k | 5.53 s | >60 s | >60 s |

Expected-score `t=3` was roughly **15–18×** slower cold than `t=2`. Every expected-score `t=4` case timed out, and target-probability timed out already at `t=3`.

Default expected-score growth illustrates the limiting factor:

| Metric | t=2 | t=3 |
|---|---:|---:|
| Terminal/scoring states | 6,563 | 415,223 |
| Run-scoped transition distributions | 2,880 | 393,780 |
| Action-value entries | 963 | 132,223 |
| V calls | 12,338 | 1,689,749 |
| Heap delta | ~35 MB | ~1.61 GB |
| End RSS | ~137 MB | ~1.75 GB |

Transposition reuse is meaningful: default `t=3` recorded 5,775 V hits, 1.27M terminal-memo hits, and ~90% reuse in the compact mechanics transition cache. It is not enough to contain the new frontier. The run-scoped targeted-continuation cache is particularly weak: only 7 hits against 396,669 misses/entries in the default `t=3` run.

The menu layer remains negligible: 6,611 exact fresh-menu operator calls consumed only about 29 ms and scanned zero explicit 1,140-menu sets. Compact transition generation took about 155 ms. Raw-scenario generation remained fixed at 48 banks; mean rescoring grew to about 3.14 s. A fully warm default `t=3` call still took 5.84 s, confirming that state/action traversal, scoring-boundary materialization, and run-scoped cache pressure dominate after generation caches are warm.

The expected-score recommendation was unchanged from `t=2` to `t=3` for all five tested menu classes. No deeper target-probability or realistic `t=4` policy claim is possible because those cases exceeded the execution ceiling.

**Decision:** production remains at two modeled token spends. See `M5_FOUR_TOKEN_EXPERIMENT.md` for full state-growth diagnostics and the recommended M5B cache-pressure package.

## M5B exact cache and scoring optimizations

M5B attacks the two largest avoidable costs identified by the M5A profile without changing the value function, transition fidelity, menu model, objective, or production horizon.

First, fresh-menu recursion no longer retains whole-board targeted-continuation and transition-distribution caches that had essentially no reuse. Second, expected-score terminal evaluation now operates from role-local compact banner IDs and reuses the same role/prefix frontiers without materializing a full descriptive `BoardState` for every terminal state. A final micro-pass keeps action memoization for current-menu calls but bypasses one-use fresh-menu `A(B,a,t)` values.

A same-runner M5A-versus-M5B comparison produced:

| Default expected score | M5A | M5B | Change |
|---|---:|---:|---:|
| t=2 cold | 1.324 s | 1.247 s | -5.8% |
| t=2 warm | 61.5 ms | 41.8 ms | -32.1% |
| t=2 heap growth | 43.3 MB | 18.1 MB | -58.1% |
| t=3 cold | 22.848 s | 17.586 s | -23.0% |
| t=3 warm | 6.218 s | 2.314 s | -62.8% |
| t=3 heap growth | 1.669 GB | 318.8 MB | -80.9% |
| t=3 max RSS | 1.758 GB | 418 MB | -76.2% |

Default t=3 still reaches exactly 415,223 terminal states. The optimization changes representation and retention, not the reachable frontier. Descriptive board materializations fall from 415,222 to zero for expected-score search; retained targeted-continuation and run-scoped transition-distribution entries fall from roughly 397k/394k to 9/9. The final fresh-action micro-pass reduces retained generic action entries from 132,223 to 3 and cuts another ~5.8% of heap growth on its paired run, but does not improve cold time materially.

The recommendation and utility remain identical. The first complete M5B pass still exceeded the 60-second ceiling at t=4, and the final cache micro-pass showed no cold-runtime improvement at t=3. Production therefore remains at two modeled token spends.

Raw data are stored in `benchmarks/m5b-exact-optimizations.json` and `benchmarks/m5b-fresh-action-cache.json`; full interpretation is in `M5B_EXACT_OPTIMIZATIONS.md`.

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
8. memoizes terminal utility, reusable current-menu action continuation, `V(B,t)`, and `Q(B,M,t)`, while bypassing one-use fresh-menu action values;
9. computes uniform fresh-menu expectation analytically instead of scanning 1,140 menus.

The uniform future-menu distribution is still modeled **exactly**; M4 changes the calculation, not the probability model. Explicit `data.menuSamples` overrides continue to be evaluated as supplied.

## Semantic note

Target-probability mode optimizes free roster/title selection for the target probability itself. The same finite-horizon value-function machinery is used for both objectives; expected score is not used as an intermediate objective in target mode.

The production decision horizon remains capped at two token spends. M5A measured deeper current-fidelity search and found realistic four-token search outside the runtime/memory envelope; M5B substantially reduced exact cache and allocation overhead but did not make t=4 tractable. Do not proceed to eight tokens until the four-token frontier is made tractable and any later approximation is explicitly validated.

## Interpretation

The runtime approximation affects continuation fidelity, not the legal action set or immediate reroll probabilities. If two actions are nearly tied, the displayed confidence should reflect that sensitivity rather than implying false precision.

## M5C calibrated depth-aware continuation

M5C tests search-only compression of **future fresh-menu transition outcomes** while preserving the root decision boundary, exact menu probabilities, Dota mechanics, and production `t=2` policy. The approximation is an explicit per-call engineering option and is structurally ignored at `t<=2`.

| Schedule | t=3 top-action agreement | Max oracle regret | Mean Kendall τ | Median runtime / current |
|---|---:|---:|---:|---:|
| High (8→6→4) | 12/12 | 0 | 0.969 | 1.194× |
| Medium (6→4→2) | 11/12 | 408.9 | 0.962 | 0.959× |
| Aggressive (4→2→1) | 12/12 | 0 | 0.957 | 0.579× |

The medium reversal occurs on a small-margin reachable state; aggressive returns to the oracle winner, so approximation error is not monotonic in retained-strata count. On the default fixture, aggressive reduced cold `t=3` runtime from 19.12 s to 10.77 s, heap growth from 349.5 MB to 197.3 MB, and max RSS from about 434 MB to 296 MB while preserving the winner.

Only aggressive advanced to `t=4`. It still timed out on **all five** established expected-score workloads under the unchanged 60-second per-case ceiling. Timed-out workers do not return trustworthy end-of-run memory snapshots, so `t=4` memory is intentionally reported as unavailable rather than inferred.

**Decision:** M5C is Outcome B. Continuation-outcome compression alone does not make four-token search tractable. Production remains at two modeled token spends. The recommended next bounded technique is **progressive widening of distant fresh-menu action evaluation**, because the aggressive schedule already reduces deepest transition outcomes to one stratum; the remaining target is action/state frontier breadth rather than additional outcome compression.

Raw reports: `benchmarks/m5c-depth-calibration.json` and `benchmarks/m5c-four-token-benchmark.json`. Full interpretation: `M5C_DEPTH_AWARE_CONTINUATION.md`.

## M5D progressive action widening

M5D adds deterministic progressive widening to **distant fresh-menu operation evaluation** while leaving the root/current visible menu exact. Every future operation identity retains a value and remains in the exact uniform best-of-three menu operator; operations outside the deepening cap keep their one-spend shallow value.

The frozen candidates were Wide `12→8→4`, Medium `8→5→3`, and Narrow `5→3→2`, with M5C aggressive outcome fidelity `4→2→1` fixed in the background. The widest passing policy rule selected **Wide**.

Final frozen calibration and holdout results:

| Gate | Result |
|---|---:|
| Calibration top-action agreement | **12/12** |
| Calibration max regret | **0** |
| Wide median runtime / oracle | **0.471×** |
| Wide median runtime / M5C aggressive | **0.756×** |
| Combined calibration + holdout agreement | **19/20 (95%)** |
| Combined max regret | **383.53** |
| Mean normalized regret | **0.050** |
| Disagreements with oracle gap >1,000 | **0** |
| Proxy deep winner within shallow top 3 | **24/24** |

The sole 20-case disagreement is a permitted near-tie on `holdout-05`; there is no stop/menu bias or disagreement-family concentration. All three M5C interaction sentinels preserve the oracle winner.

The first four-token run exposed an exact scoring hot spot rather than a widening-fidelity failure. Two semantics-preserving fixes—dense prefix-aligned terminal composition and a direct canonical-team title-boost lookup—reduced terminal scoring overhead while retaining compact-vs-descriptive scoring equivalence and alias behavior.

The authoritative final `t=4` run completed all five required expected-score workloads below 60 seconds:

| Workload | Wide `t=4` |
|---|---:|
| Default | **31.86 s** |
| Quality-heavy | **36.87 s** |
| Stat-heavy | **48.22 s** |
| Trait-heavy | **29.35 s** |
| Global-quality | **31.36 s** |

**Decision: M5D Outcome A.** Four-token expected-score search is feasible under the frozen M5C-aggressive + M5D-Wide engineering policy. Production nevertheless remains capped at two modeled token spends, with both approximations disabled by default. The next bounded experiment is target-probability `t=3` feasibility; production depth should not change until that path is characterized.

Raw evidence: `benchmarks/m5d-proxy-rank-diagnostics.json`, `benchmarks/m5d-widening-calibration.json`, `benchmarks/m5d-widening-holdout.json`, and `benchmarks/m5d-four-token-benchmark.json`. Full interpretation: `M5D_PROGRESSIVE_ACTION_WIDENING.md`.
