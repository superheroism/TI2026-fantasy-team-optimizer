# M5C — Calibrated Depth-Aware Continuation

## Result

M5C tested whether reducing **future fresh-menu transition outcomes by recursive depth** could make realistic four-token expected-score search tractable without changing the current-action policy.

**Outcome B: continuation-outcome compression alone is insufficient.** Production remains capped at two modeled token spends and no M5C approximation is enabled by default.

## Approximation boundary

M5C adds `src/engine/continuationFidelity.ts`, an explicit search-only fidelity policy. The engineering-only `OptimizerSearchOptions.experimentalContinuationFidelity` option is structurally ignored when the modeled horizon is `t<=2`.

The root decision boundary is unchanged: immediate visible-action transitions remain fully enumerated; legality, action identity, stop, menu reroll, token accounting, uniform 3-of-20 menu probabilities, explicit `data.menuSamples`, Dota mechanics, scoring semantics, and compact state identity remain unchanged. Approximation enters only for actions reached through a fresh future menu.

Tested fresh-menu schedules were:

| Schedule | Strata by recursive depth |
|---|---|
| Current oracle | 8 → 8 → 8… |
| High | 8 → 6 → 4… |
| Medium | 6 → 4 → 2… |
| Aggressive | 4 → 2 → 1… |

Configured data fidelity remains a ceiling, so a schedule never increases a lower configured budget.

## Oracle and corpus

The expected-score oracle is current-fidelity M5B behavior at `t=3`. The deterministic calibration corpus contains the five established workloads plus seven reachable states generated through the real compact transition model. Menus cover stat, quality, trait, redistribution, and global-quality operations. Oracle top-two gaps range from roughly 224 to 4,004 points.

For every schedule M5C records the full ranked current-action table, top-action agreement, oracle regret, normalized regret, Kendall rank agreement, action-utility error, runtime, memory, V/action/transition/scenario diagnostics, and compression counts. Raw results are in `benchmarks/m5c-depth-calibration.json`.

## t=3 calibration

| Schedule | Top-action agreement | Mean regret | Max regret | Mean Kendall τ | Median runtime / oracle |
|---|---:|---:|---:|---:|---:|
| High | 12/12 (100%) | 0 | 0 | 0.969 | 1.194× |
| Medium | 11/12 (91.7%) | 34.1 | 408.9 | 0.962 | 0.959× |
| Aggressive | 12/12 (100%) | 0 | 0 | 0.957 | 0.579× |

`medium` reverses one small-margin fixture (`reachable-two-step-b`): the oracle chooses Core → green quality reroll and medium chooses the same operation on Mid. Regret is 408.9 points. `aggressive` returns to the oracle winner on that same state, so approximation error is **not monotonic** in retained-strata count.

Margin sensitivity:

| Oracle gap | Fixtures | High | Medium | Aggressive |
|---|---:|---:|---:|---:|
| ≤500 | 3 | 3/3 | 2/3 | 3/3 |
| 500–1,500 | 6 | 6/6 | 6/6 | 6/6 |
| >1,500 | 3 | 3/3 | 3/3 | 3/3 |

On the default fixture, aggressive reduced cold `t=3` runtime from 19.12 s to 10.77 s, heap growth from 349.5 MB to 197.3 MB, and max RSS from about 434 MB to 296 MB while preserving Core → red quality reroll.

## t=4 feasibility

Only aggressive advanced because it combined perfect observed t=3 winner agreement, zero oracle regret, and material runtime reduction. The 60-second isolated-case ceiling was unchanged.

| Workload | Aggressive t=4 |
|---|---:|
| Default | >60 s |
| Quality-heavy | >60 s |
| Stat-heavy | >60 s |
| Trait-heavy | >60 s |
| Global-quality | >60 s |

**0/5 completed.** Each worker was terminated at roughly 60.1 seconds. Timed-out workers do not return trustworthy final memory/state diagnostics, so those values are intentionally reported as unavailable. Raw results are in `benchmarks/m5c-four-token-benchmark.json`.

## Interpretation

M5A/M5B already showed that exact menu evaluation, compact transition generation, raw-scenario generation, descriptive-board materialization, and one-use continuation caches were not the dominant remaining barrier. M5C directly compressed transition-outcome breadth; the aggressive schedule reaches a single retained stratum at deep continuation and still cannot complete realistic `t=4`.

The remaining problem is therefore better characterized as the **distant action/state frontier** than as excess outcome fidelity.

## Target-probability limitation

M5C does not claim validated deep target-probability accuracy. Current-fidelity target-probability search already exceeds the benchmark ceiling at `t=3`, so there is no realistic deep oracle. Existing regressions preserve the complete ranked `t<=2` policy for expected-score and target-probability objectives, and exact synthetic V/Q systems remain validated through `t=4`. Production target-probability search remains `t=2`.

## Correctness

After replacing the temporary module-global experimental selector with a per-call search option, Node 22 GitHub Actions passed typecheck, generated build, and the full test suite. Existing exact transition tests and explicit-tree V/Q tests through `t=4` remain green; M5C adds deterministic schedule/configuration tests and a structural `t<=2` isolation regression.

## Recommendation

Do not advance continuation compression to production. The next single bounded M5 technique should be **progressive widening of distant fresh-menu action evaluation**: reduce distant operation/role branch breadth while leaving the root exact, and calibrate it with the same current-action regret methodology.

M5C does not implement progressive widening and does not begin `t=8`.
