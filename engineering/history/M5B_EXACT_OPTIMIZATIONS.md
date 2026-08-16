# M5B — Exact Cache and Scoring Optimizations

## Purpose

M5A established that the finite-horizon architecture is semantically sound through four tokens, but realistic search becomes impractical before four tokens. This package attacks the two clearest measured sources of avoidable overhead without changing the search objective, transition fidelity, menu model, or production horizon.

The two changes are:

1. stop retaining one-use fresh-menu continuation data in run-scoped caches;
2. score expected-value terminal states from compact role-local banner IDs instead of materializing a descriptive three-banner `BoardState` for every reachable board.

A final micro-pass also stops memoizing fresh-menu `A(B,a,t)` values inside the generic value function. Those values are consumed once during a memoized `V(B,t)` expansion, so retaining them cannot create reuse. Current-menu action memoization remains unchanged.

## Semantics preserved

M5B does not change the M4/M5A value-function definitions:

- `S(B)` is terminal utility;
- `A(B,a,t) = Σ P(B'|B,a) × V(B',t-1)`;
- `R(B,t) = V(B,t-1)`;
- `Q(B,M,t)` is the maximum of stop, reroll, and legal visible actions;
- `V(B,t)` is the exact fresh-menu expectation of `Q` under the current menu model.

It also preserves the existing continuation fidelity asymmetry:

- visible immediate metrics use the complete transition distribution;
- the first visible action entering continuation uses `continuationEntryStrata`;
- actions reached through a fresh menu use `continuationOutcomeStrata`.

No pruning, probability truncation, reduced horizon, or new approximation was introduced. Normal application calls remain capped at two modeled token spends.

## 1. Cache-pressure cleanup

### Removed from fresh-menu recursion

The M5A default t=3 profile retained approximately:

- 396,669 targeted continuation entries for 7 hits;
- 393,780 whole-board transition-distribution entries;
- 132,223 generic action-value entries with 0 hits.

M5B keeps current-menu cache entries, because they are externally addressable and can be reused for visible metrics/Q evaluation, but bypasses these redundant caches during fresh-menu recursion.

After the first cache pass, the default t=3 search retained only:

- 9 targeted continuation entries;
- 9 run-scoped transition-distribution entries.

The final action-cache micro-pass reduced retained generic action entries from 132,223 to 3. It did not improve cold runtime materially, but reduced paired-run heap growth by another 5.8%, so the exact change was retained.

The compact banner-level transition cache remains active. Fresh-menu whole-board transition retention was removed specifically because the narrower compact mechanics cache already provides the useful reuse.

## 2. Compact expected-score terminal evaluation

`evaluateBoardExpectedFast` was already mathematically factorized by role, but the optimizer still converted every compact `EngineState` back to a full `BoardState` before reaching the role/prefix caches.

M5B adds a compact expected-score evaluator keyed by role-local `BannerStateID`:

- unchanged role IDs reuse their role/prefix frontier directly;
- each distinct role-local banner is decoded only when its frontier is first needed;
- title-prefix values are composed from the same `rolePrefixFrontier` results used by the descriptive scorer;
- the existing descriptive fallback remains available when no complete prefix frontier exists.

For the default t=3 expected-score search:

- descriptive board materializations fell from 415,222 to 0;
- descriptive board cache entries fell from 415,223 to 1;
- only 31,009 distinct role-local banners required compact expected-score frontier materialization;
- the number of reachable terminal states remained exactly 415,223.

The target-probability objective intentionally retains descriptive-board materialization because its terminal objective depends on the distribution-aware target-probability scorer rather than only the expected-value role/prefix frontier. Consequently, target-probability runtime is essentially unchanged by this package.

## Correctness

The full repository test suite passes after the changes.

M5B adds a direct equivalence test that enumerates reachable compact states from the default board across the action catalog and checks:

`compact expected scorer == evaluateBoardExpectedFast(descriptive board)`

for every tested state.

Existing M5A/M4 regression coverage continues to enforce:

- explicit-tree `V` and `Q` equivalence through t=4 on synthetic systems;
- expected-score and target-probability t≤2 ranked-table equivalence;
- empirical menu-sample behavior;
- production horizon capped at two;
- stop/reroll/action legality and monotonicity.

The fresh-action memoization test still proves that repeated current-menu `A` calls are memoized; fresh-menu calls are now explicitly recorded as cache bypasses.

## Same-runner benchmark

The principal before/after comparison ran M5A commit `67990c74636965b2116eb45c8aeec0b195830819` and the first complete M5B cache+scoring pass on the same GitHub-hosted runner.

| Default expected score | M5A | M5B | Change |
|---|---:|---:|---:|
| t=2 cold | 1.324 s | 1.247 s | 5.8% faster |
| t=2 warm | 61.5 ms | 41.8 ms | 32.1% faster |
| t=2 heap growth | 43.3 MB | 18.1 MB | 58.1% lower |
| t=3 cold | 22.848 s | 17.586 s | 23.0% faster |
| t=3 warm | 6.218 s | 2.314 s | 62.8% faster |
| t=3 heap growth | 1.669 GB | 318.8 MB | 80.9% lower |
| t=3 max RSS | 1.758 GB | 418 MB | 76.2% lower |

The recommended action and expected utility were identical before and after the optimization:

- recommendation: `CORE → Reroll Quality for Red Emblems`;
- expected final utility: `63,791.02315159113`;
- runner-up: `MID → Reroll Quality for Red Emblems`.

The final fresh-action-cache micro-pass was measured separately on one runner:

| Default t=3 | Before micro-pass | After micro-pass |
|---|---:|---:|
| cold | 13.711 s | 13.735 s |
| warm | 1.863 s | 1.821 s |
| heap growth | 355.1 MB | 334.7 MB |
| max RSS | 448.7 MB | 436.7 MB |
| retained action entries | 132,223 | 3 |

The cold-time difference is noise-level and slightly negative; the change is retained for its measurable memory reduction and elimination of a cache with zero observed reuse.

Raw measurements are stored in:

- `benchmarks/m5b-exact-optimizations.json`;
- `benchmarks/m5b-fresh-action-cache.json`.

## Four-token result

The first complete M5B pass still exceeded the 60-second per-case ceiling at t=4. The final micro-pass produced no material cold-runtime improvement at t=3, so there is no evidence that it changes that feasibility boundary.

Therefore M5B does **not** justify increasing the production horizon. Production remains at two modeled token spends.

## What remains expensive

M5B removed a large amount of accidental retention, but it did not shrink the reachable dynamic-programming frontier:

- default t=3 still reaches 415,223 terminal states;
- it still performs the same stochastic transition/action evaluations;
- raw role-scenario rescoring remains a multi-second cold cost;
- the value function still makes roughly the same number of recursive calls and terminal decisions.

The key conclusion is now sharper than after M5A:

> exact cache and boundary-allocation cleanup can make t=3 substantially lighter, but exact/current-fidelity state expansion remains the dominant barrier to t=4.

## Recommended next step

If further exact engineering is desired before approximation, the remaining candidates should be small and benchmark-gated: eliminate duplicate terminal-scalar storage where possible and reduce per-terminal title/frontier composition overhead. Neither is likely to remove the order-of-magnitude state-growth problem.

For a material expansion beyond the current horizon, the next architecture experiment should therefore be depth-aware continuation fidelity or another roadmap-approved bounded approximation, calibrated against completed exact/current-fidelity t=2/t=3 results. That should be treated as a separate package rather than mixed into M5B.
