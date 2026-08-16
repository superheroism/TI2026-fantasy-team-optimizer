# M5A — Four-Token Finite-Horizon Experiment

## Status

M5A extends the M4 value-function architecture to support an **opt-in experimental finite horizon through four modeled token spends** while keeping the production/application path capped at two.

The measured conclusion is:

> **Exact/current-fidelity four-token search is not production-tractable.**

Every realistic expected-score `t=4` benchmark exceeded the 60-second per-case ceiling. Target-probability search exceeded the same ceiling already at `t=3`.

No approximation, horizon-dependent stochastic budget, pruning, progressive widening, interpolation, worker parallelism, or reduced-fidelity transition treatment was introduced to force completion.

## Architecture changes

`recommendNextAction` now accepts an engineering-only `modeledHorizonOverride`. Normal callers omit it and remain capped at the merged M4 production horizon of two tokens, even if `DataBundle.simulation.maxLookaheadTokens` is configured above two.

The value-function semantics remain the M4 semantics:

```text
S(B) = terminal utility

A(B,a,t)
  = Σ P(B' | B,a) × V(B',t-1)

R(B,t)
  = V(B,t-1)

Q(B,M,t)
  = max(
      S(B),
      R(B,t),
      legal visible board actions
    )

V(B,t)
  = E_M[Q(B,M,t)]
```

The menu-reroll path is parameterized generically as `V(B,t-1)`. At production `t=2` this is exactly the M4 `V(B,1)` behavior.

Compact `BoardStateID` remains the DP identity. Descriptive `BoardState` remains a scoring/UI boundary object.

## Stochastic fidelity retained

M5A deliberately preserves the M4 transition treatment at every recursive depth:

- immediate visible-action metrics: complete transition distribution;
- first visible action entering continuation: `continuationEntryStrata`;
- actions reached through fresh menus: `continuationOutcomeStrata`.

The fresh-menu distribution remains the exact analytic uniform 3-of-20 operator unless an explicit `menuSamples` override is supplied.

Raw player-performance scenario banks remain reusable across hypothetical boards. The experiment does not reduce scenario counts as horizon grows.

## Correctness

The generic value-function tests now compare memoized `V` and `Q` against complete explicit-tree enumeration for `t=0,1,2,3,4`.

Coverage includes:

- deterministic transitions;
- stochastic transitions;
- transpositions;
- stop-dominant states;
- visible-action-dominant states;
- menu-reroll-dominant states;
- repeated menu rerolls;
- ties;
- unavailable actions;
- `V(B,t+1) >= V(B,t)`;
- `Q(B,M,t+1) >= Q(B,M,t)` for a fixed visible menu.

The established M4 Dota regression suite remains in place. M5A additionally compares the complete ranked action table returned by the normal production API with the experimental API at `t<=2` for both expected-score and target-probability objectives. A separate regression proves that production remains capped at two modeled tokens even when the data configuration asks for four.

Typecheck, deterministic build/generated-artifact verification, and the full test suite passed on Node 22 GitHub Actions after the M5A changes.

## Instrumentation

M5A adds per-depth observability for:

- raw `V`, `Q`, and action-value calls;
- cache hits and misses;
- unique V/Q/action states;
- cache entry counts;
- targeted action requests/hits/misses by depth;
- run-scoped transition-distribution entries and reuse;
- descriptive board materializations;
- terminal scoring calls;
- transition work;
- menu-operator work;
- raw-scenario generation/rescoring;
- process heap/RSS snapshots in the benchmark harness.

The benchmark records process high-water RSS where Node exposes it. These are process-level memory measurements, not exact allocation counts.

## Benchmark protocol

Raw output is preserved in:

`benchmarks/m5-four-token-experiment.json`

Runtime:

- Node `v22.23.2`
- Linux x64 GitHub runner
- same benchmark harness for `t=2`, `t=3`, and `t=4`
- 60-second execution ceiling per isolated case
- production simulation/search settings retained
- no horizon-dependent fidelity changes

Menus:

- default;
- quality-heavy;
- stat-heavy;
- trait-heavy;
- global-quality;
- target-probability at 55k.

Each completed case records a cold run and a warm run. The warm run reuses the module-level compact transition/scenario caches, but value-function, board, targeted-action, and full-board transition maps remain run-scoped as in production.

## Runtime growth

### Expected-score objective

| Menu | t=2 cold | t=3 cold | t=3 / t=2 | t=4 |
|---|---:|---:|---:|---:|
| Default | 1.57 s | 22.85 s | 14.5× | >60 s ceiling |
| Quality-heavy | 1.66 s | 28.21 s | 17.0× | >60 s ceiling |
| Stat-heavy | 1.59 s | 27.49 s | 17.3× | >60 s ceiling |
| Trait-heavy | ~1.30 s | 23.31 s | ~17.9× | >60 s ceiling |
| Global-quality | ~1.43 s | 23.40 s | ~16.4× | >60 s ceiling |

Default `t=3` warm runtime was 5.84 s even after raw-scenario generation and compact-transition generation were fully warm.

### Target-probability objective

| Horizon | Cold result |
|---|---:|
| t=2 | 5.53 s |
| t=3 | >60 s ceiling |
| t=4 | >60 s ceiling |

Target-probability search therefore crosses the benchmark ceiling one depth earlier than expected-score search.

## State-space growth

The default expected-score case shows the characteristic expansion:

| Metric | t=2 | t=3 |
|---|---:|---:|
| Descriptive scoring-boundary boards | 6,562 | 415,222 |
| Terminal scoring states | 6,563 | 415,223 |
| Run-scoped targeted-action entries | 2,889 | 396,669 |
| Run-scoped transition-distribution entries | 2,880 | 393,780 |
| V calls | 12,338 | 1,689,749 |
| V cache hits | 1 | 5,775 |
| V cache misses | 48 | 6,611 |
| Action-value entries | 963 | 132,223 |
| Heap delta | ~35 MB | ~1.61 GB |
| End RSS | ~137 MB | ~1.75 GB |

Unique V states by recursive depth for the default case were:

```text
t=2 search:
  V depth 0: 6,563
  V depth 1: 48

t=3 search:
  V depth 0: 415,223
  V depth 1:   6,563
  V depth 2:      48
```

The realistic `t=4` processes were terminated at the 60-second ceiling before returning final diagnostics, so M5A does **not** claim final t=4 state counts. The timeout itself is the measured execution ceiling. Exact synthetic systems are still validated through t=4.

## Transposition effectiveness

Memoization is useful but insufficient to contain the realistic frontier.

For default expected-score `t=3`:

- V cache: 5,775 hits / 6,611 misses among memoized-depth requests, about 46.6% hits;
- terminal memo: 1,268,753 hits / 415,222 misses, about 75.3% hits;
- compact transition mechanics cache: 354,140 hits / 39,640 misses, about 89.9% hits;
- run-scoped full-board transition-distribution cache: 2,898 hits / 393,780 misses, about 0.7% hits;
- targeted role-continuation cache: 7 hits / 396,669 misses, effectively zero reuse.

The important distinction is that canonical-state transpositions are real, but each additional depth still exposes hundreds of thousands of new terminal/action states.

## Bottleneck diagnosis

The analytic menu operator is not the bottleneck. In default `t=3` it handled 6,611 fresh-menu expectations, scanned zero explicit 1,140-menu sets, and consumed about 29 ms total.

Compact transition **generation** is also small relative to the whole search: about 155 ms in the default cold `t=3` run. Raw scenario generation remains fixed at 48 banks; deeper search reuses them rather than regenerating them.

Scoring work does grow materially: default `t=3` made about 496k raw-scenario requests, with only 48 misses, and spent about 3.14 s in mean rescoring. But the warm run is especially diagnostic: with no new raw-scenario generation and no new compact-transition generation, it still required about 5.84 s and rebuilt the same ~415k scoring-boundary boards and large run-scoped DP/action maps.

The measured limiting factor is therefore the **reachable terminal/action frontier plus its scoring-boundary materialization and run-scoped cache pressure**, not menu enumeration.

Memory pressure is already severe at `t=3`: representative expected-score cases ended around 1.7–2.1 GB RSS. This makes a production four-token search unacceptable even before considering browser-main-thread constraints.

## Policy convergence

Deeper continuation increased modeled utility, as expected when an optional token is added, but the useful policy question is whether the **current action** changed.

It did not change from `t=2` to `t=3` in any completed expected-score workload:

| Menu | t=2 recommendation | t=3 recommendation | Rank-1 gap t=2 → t=3 |
|---|---|---|---:|
| Default | Core → red quality reroll | same | 3,581 → 3,131 |
| Quality-heavy | Mid → quality redistribution | same | 694 → 715 |
| Stat-heavy | Menu reroll | same | 1,463 → 1,410 |
| Trait-heavy | Support → blue trait reroll | same | 83 → 224 |
| Global-quality | Mid → quality redistribution | same | 694 → 715 |

No target-probability policy-stability claim is made beyond `t=2`, because `t=3` did not complete within the benchmark envelope.

No realistic `t=4` policy result is available because all cases hit the ceiling.

## Exact optimizations made in M5A

M5A does not add a post-measurement search shortcut. The purpose of this package is to expose the unmodified M4 finite-horizon architecture at deeper depth and measure it.

The implementation changes are limited to:

- clean horizon parameterization behind an experimental override;
- generic menu-reroll token recursion;
- diagnostics required to observe state/transposition growth;
- exact t=4 synthetic/regression coverage;
- dedicated isolated benchmarks.

## Production decision

Production remains at a **two-token modeled horizon**.

The evidence does not justify making three or four tokens the browser/UI default:

- `t=3` expected-score is ~15–18× slower cold and consumes roughly 1.6–1.9 GB additional heap in representative cases;
- target-probability `t=3` exceeds 60 seconds;
- every `t=4` realistic workload exceeds 60 seconds;
- all completed expected-score policies were already stable from `t=2` to `t=3`.

## Recommendation for M5B

The smallest evidence-driven next package should remain **exact** before introducing approximate fidelity:

> **Narrow or remove the run-scoped fresh-menu targeted-continuation cache, then remeasure state/memory growth.**

At default `t=3`, that cache stored 396,669 entries while producing only seven hits. Fresh-menu targeted continuations are normally consumed once while computing the already-memoized operation value, so retaining all role-level results appears to impose substantial memory pressure for essentially no transposition benefit.

M5B should:

1. prove which targeted-continuation entries are single-use;
2. stop retaining those entries while preserving the canonical operation-level `A(B,a,t)` memo;
3. benchmark memory/runtime before and after;
4. then evaluate whether the similarly low-reuse run-scoped full-board transition-distribution cache should be narrowed;
5. rerun the same `t=2/3/4` matrix.

If those exact cache-pressure changes still leave `t=4` outside the envelope, the next bounded package should test **depth-aware continuation outcome fidelity** against completed exact/current-fidelity `t=3` results as the oracle. That would directly reduce the branching frontier while retaining full immediate visible-action distributions and the exact fresh-menu operator.

Do not begin `t=8` until `t=4` is tractable and policy error from any later approximation is explicitly measured.
