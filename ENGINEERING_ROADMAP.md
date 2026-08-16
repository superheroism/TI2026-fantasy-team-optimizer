# TI2026 Fantasy Optimizer — Engineering Roadmap

**Status:** Frozen reference plan  
**Date:** 2026-08-12  
**Purpose:** Build toward a faster, more stable, cleaner optimizer whose search policy can evolve from the current bounded lookahead to finite-horizon dynamic programming without sacrificing correctness or maintainability.

## Engineering principles

1. **One authoritative implementation.** `src/`, `site/`, and `data/` are source inputs. Compiled/deployment trees are generated artifacts and must be reproducible from those inputs.
2. **Correctness before throughput.** Performance changes must preserve a regression baseline and the selected optimization objective.
3. **Separate concerns.** Search should not encode Dota mechanics; scoring should not encode search; UI should not encode either.
4. **Compact state before deep search.** Do not build deep DP around nested mutable objects or JSON serialization.
5. **Reuse stochastic work.** Competing board states should consume the same latent scenarios wherever possible.
6. **Exact where cheap, approximate where valuable.** Use exact transition/menu mathematics when available; spend Monte Carlo budget on uncertainty that can change the decision.
7. **Parallelize late.** Establish a pure engine boundary before adding workers or other concurrency.
8. **Keep every milestone shippable.** Each phase should leave the current application usable and measurable.

---

## Target architecture

```text
UI
 │
 └── Optimizer API / Worker
       │
       ├── Search / Policy
       │     ├── Dynamic-programming value function
       │     ├── Menu model
       │     └── Utility objective
       │
       ├── Transition Model
       │     └── P(next board | board, operation, target)
       │
       ├── Scoring Engine
       │     ├── Scenario generator
       │     ├── Role scorer
       │     ├── Roster/title optimizer
       │     └── Score/target utility
       │
       ├── Rules
       │     └── legality + traits + quality mechanics
       │
       └── Data Model
             ├── statistical model
             ├── rosters
             └── ruleset/version
```

Core architectural rule:

> **Search knows nothing about Dota mechanics, scoring knows nothing about search, and the UI knows neither.**

---

# Phase 0 — Freeze and measure the current system

Before restructuring, establish a trustworthy baseline.

### Work

- Define canonical source inputs.
- Create deterministic golden/regression cases for:
  - current board score;
  - roster selection;
  - operation legality and transitions;
  - menu reroll;
  - known recommendations;
  - expected-score objective;
  - target-probability objective.
- Make stochastic regression tests deterministic.
- Expand benchmarking beyond one elapsed-time number:
  - scoring throughput;
  - cold/warm optimizer latency;
  - selected-board simulation throughput;
  - team-ranking throughput;
  - objective and recommended action.
- Preserve historical benchmark results for comparison.

### Exit criterion

```text
correctness >= baseline
performance known relative to baseline
```

---

# Phase 1 — Make the repository reproducible

**Goal:** one program and one source of truth.

### Source authority

```text
src/        canonical TypeScript application source
data/       canonical model/rules data
site/       canonical static HTML/CSS
scripts/    build/verification tooling
tests/      regression and integration tests

build/      generated compiler output
docs/       generated GitHub Pages output
```

### Work

- Make builds deterministic and cross-platform where practical.
- Verify generated `build/` and `docs/` trees against canonical inputs.
- Add CI: typecheck → generated-artifact verification → tests.
- Pin direct build dependencies.
- Prevent hand-edited generated JavaScript from silently diverging from TypeScript.
- Fix target-probability semantics so free roster/title selection optimizes the selected target objective rather than expected score first.
- Preserve existing GitHub Pages behavior during the migration.

### Exit criterion

Deleting and rebuilding generated artifacts produces the same deployed program, and target-probability mode actually maximizes target probability.

---

# Phase 2 — Establish clean engine boundaries

Refactor concepts without materially changing the current search algorithm.

### Ruleset
Owns legal stat pools, duplicate rules, traits, tier effects, operation definitions, and token mechanics.

### TransitionModel

```text
transitions(board, action)
→ [{ nextState, probability }, ...]
```

No scoring logic.

### ScoringModel

```text
score(board, objective/context)
→ utility / distribution
```

No reroll/search logic.

### MenuModel

```text
P(menu)
```

The current uniform 3-of-20 mechanism becomes one implementation rather than an optimizer assumption.

### Policy / Search
Consumes state, transition probabilities, menu probabilities, utility, and tokens remaining.

### Exit criterion
The current bounded-lookahead optimizer produces equivalent decisions through these interfaces.

---

# Phase 3 — Canonicalize and compact state

Replace nested-object identity and repeated `JSON.stringify` keys with compact immutable engine state.

### Direction

Each emblem is encoded from its variable state:

```text
stat × quality × trait
```

Immutable slot properties such as color/position are implicit in slot identity.

A board becomes conceptually:

```text
CoreStateID
MidStateID
SupportStateID
```

### Separate representations

- **UI state:** descriptive objects optimized for rendering/editing.
- **Engine state:** compact canonical IDs optimized for equality, hashing, transitions, and memoization.
- **Adapters:** explicit conversions between them.

### Precompute where possible

```text
emblem state → derived multiplier
banner state → trait effects
banner state + operation → next-state distribution
```

### Expected payoff

- cheaper equality/hashing;
- far fewer allocations;
- structural sharing;
- small memoization keys;
- much cheaper transition generation;
- practical foundation for DP.

### Exit criterion
Search primarily operates on canonical state IDs rather than serialized board objects.

---

# Phase 4 — Rebuild simulation around reusable scenarios

Make expensive stochastic generation independent of hypothetical board changes.

### Target flow

```text
seed
 ↓
latent correlated tournament/game scenarios
 ↓
team/stat raw realizations
 ↓
cached scenario bank
```

Board evaluation then becomes closer to:

```text
scenario values
× emblem multipliers/traits
→ retained-game logic
→ role score
```

A quality/trait reroll should not regenerate player performance.

### Additional work

- typed arrays in hot paths;
- allocation-free inner loops;
- one sort for multiple quantiles;
- streaming accumulation of means/exceedance counts;
- keep full sample arrays only where downstream logic needs them;
- distinct search-fidelity and presentation-fidelity simulation budgets.

### Exit criterion
Increasing optimizer scenario count is substantially cheaper, and competing actions are evaluated on reusable common scenarios.

---

# Phase 5 — Replace future-menu enumeration with a menu operator

Under the current uniform 3-without-replacement menu rule, do not enumerate all 1,140 menus after action continuation values are known.

Given values for the 20 operation types, sort the values and compute the probability that each rank is the best operation appearing in a uniformly drawn three-operation menu. This yields the exact expected best-menu value with a small combinatorial weighted sum.

Preserve an abstract `MenuModel` so empirical/non-uniform menu generation can use another implementation.

### Exit criterion
Uniform fresh-menu expectation no longer requires scanning 1,140 explicit menus.

---

# Phase 6 — Introduce the value function

Define two related finite-horizon values.

```text
V(B, t)
```

Expected final utility from board `B` with `t` tokens before seeing a fresh menu.

```text
Q(B, M, t)
```

Expected final utility after seeing current menu `M`.

For a board-changing action:

```text
A(B, action, t)
  = Σ P(B' | B, action) × V(B', t-1)
```

Stop:

```text
S(B) = utility(B)
```

Menu reroll:

```text
R(B,t) = V(B,t-1)
```

Current-menu decision:

```text
Q(B,M,t)
  = max(
      S(B),
      R(B,t),
      A(B,a1,t),
      A(B,a2,t),
      A(B,a3,t)
    )
```

Fresh-menu value:

```text
V(B,t) = E_M[Q(B,M,t)]
```

`V(B,t)` becomes the principal memoized DP object.

---

# Phase 7 — Make deep DP tractable

Do not jump directly to exact 30-token search.

### Fidelity by horizon

```text
t = 0       exact terminal utility
t = 1–2     exact / near-exact
t = 3–4     high fidelity
t = 5–10    reduced scenario / transition fidelity
t > 10      approximate continuation value where needed
```

### Techniques

- memoized `V(B,t)`;
- transposition tables;
- dominance pruning;
- probability truncation for negligible outcomes;
- progressive widening;
- adaptive simulation budgets;
- interpolation/approximation for structurally similar distant states;
- banner-level factorization and reuse of unchanged-role evaluations.

### Milestone progression

```text
2-token horizon
→ 4
→ 8
→ practical full remaining-token horizon
```

Validate policy stability at each increase.

---

# Phase 8 — Add adaptive precision

Do not spend equal simulation budget on obviously separated actions and near-ties.

### Sequential refinement

1. Evaluate all candidates cheaply.
2. Remove obvious losers.
3. Increase simulation fidelity for close candidates.
4. Stop when confidence separates them or the compute budget is exhausted.

This improves decision quality per millisecond and supports explicit low-confidence reporting when the top actions remain effectively tied.

---

# Phase 9 — Move optimization into Web Workers

Only after the engine API is clean and sufficiently pure.

```text
UI
 ↕ messages
Worker
 └── optimizer engine
```

Immediate benefit: no browser-main-thread blocking.

Later, parallelize scenario generation/evaluation batches before attempting to parallelize the DP search tree itself.

---

# Phase 10 — Clean the product/application layer

After the engine boundary stabilizes, decompose UI/application responsibilities.

Suggested lightweight vanilla-TypeScript structure:

```text
ui/
  state
  controls
  boardView
  actionView
  plots
  persistence
  optimizerClient
```

Avoid introducing a framework unless UI complexity independently justifies it.

Add/complete:

- linting and formatting;
- import-boundary rules;
- dead-code detection;
- versioned data schemas;
- cache observability;
- bounded/LRU caches where evidence supports them;
- explicit model/ruleset compatibility checks.

---

# Engineering milestones

| Milestone | Major result | Expected performance effect | Risk |
|---|---|---:|---|
| **M1 — Trustworthy Build** | One source authority, reproducibility, regression tests, objective correctness, baseline benchmarks | Neutral | Low |
| **M2 — Clean Engine** | Rules / scoring / transitions / search separated | Neutral–small gain | Low |
| **M3 — Fast State Engine** | Compact states, cached transitions, reusable simulations | Large gain | Medium |
| **M4 — DP Foundation** | Exact menu operator + memoized value function | Large gain | Medium |
| **M5 — Deep Search** | Adaptive finite-horizon DP | Major model improvement | Medium–high |
| **M6 — Production Polish** | Workers, adaptive precision, UI cleanup, tooling | Large UX/throughput gain | Low–medium |

Dependency:

```text
M1
 ↓
M2
 ↓
M3
 ↓
M4
 ↓
M5
 ↓
M6
```

## Explicit sequencing decisions

- **Do not build DP before compact state.** Deep memoization over nested objects/JSON keys would fossilize the wrong state representation.
- **Do not add workers before the engine boundary is clean.** Concurrency would amplify coupling rather than solve it.
- **Do not globally raise simulation counts before scenario reuse/adaptive precision.** First reduce the marginal cost of information.
- **Do not remove deployment artifacts until deployment is explicitly migrated.** During M1 they remain generated, verified compatibility artifacts.

---

# M1 frozen scope

M1 is intentionally limited to making the existing optimizer trustworthy and measurable.

### Included

- Canonical-source policy (`src/`, `site/`, `data/`).
- Cross-platform deterministic build path.
- Generated-output verification.
- CI for typecheck, reproducibility, and tests.
- Pinned direct TypeScript version.
- Regression tests for target-probability semantics and deterministic behavior.
- Target-probability roster/title correction.
- More informative benchmark output and machine-readable baseline option.

### Deferred

- Compact state IDs.
- Rules/Search/Transition interface redesign.
- Future-menu combinatorial operator.
- DP/value-function implementation.
- Web Workers.
- Broad UI-module refactor.
- Cache redesign/instrumentation requiring engine changes.

### M1 success definition

1. The TypeScript source tree is the authoritative implementation.
2. A clean generated build matches the committed/generated deployment tree.
3. CI detects source/generated drift.
4. Existing tests remain green.
5. Target-probability mode jointly chooses the free roster/title that maximizes `P(score >= target)`.
6. Benchmarks produce repeatable cold/warm measurements suitable for later M2–M6 comparisons.


---

## M6A — Versioned board-layout expansion

M6A interrupted the post-M5 deep-search sequence because the client geometry is expanding from three to five emblem slots per role. The engine now treats board geometry as ruleset/version data rather than a search invariant. `legacy_3` preserves Core `R-G-R`, Mid `R-B-G`, and Support `B-G-B`; `expanded_5` uses Core `R-G-R-G-R`, Mid `R-B-G-R-G`, and Support `B-G-B-G-B`. Both layouts use only the existing Red, Green, and Blue stat colors and their unchanged legacy eligible-stat pools.

Legacy compact IDs retain their original numeric namespace. Expanded board IDs occupy a disjoint versioned namespace, and layout identity is included in transition, scoring, target-preparation, and mechanics caches. The descriptive `BoardState` boundary remains explicit; old unversioned board objects resolve to `legacy_3`. Production remains pinned to `legacy_3` with modeled horizon `<=2`.

Five-slot quality redistribution is defined and tested: one slot is selected uniformly to decrease, then two distinct recipients are selected uniformly from all unordered pairs among the remaining four slots. The other two slots are unchanged. Existing tier-direction distributions, Tier-I/Tier-V floor/cap waste, and final-state aggregation are preserved. For `legacy_3`, the same generalized definition reduces exactly to one decreased slot and the other two increased.

The corrected authoritative Node 22 matrix completed 12/12 cases and the complete 199-test suite passed. Relative to `legacy_3`, corrected `expanded_5` optimizer runtime at `t=2` was **2.86× stat-heavy, 5.48× quality-heavy, 3.26× trait-heavy, 4.13× global-quality, and 3.09× target-probability**. The expanded target case reached **17,862 target scalar states**. The isolated stat-heavy `t=1` wall-time ratio was 0.14× and is treated as runner noise rather than evidence of a structural speedup.

The dominant effect is frontier/branch growth: representative stat-heavy one-step reachable outcomes remain 5 → 21, while correctly recognizing the added Blue slots substantially increases the operations and future states reachable from Mid/Support. M6A therefore closes as **Outcome A** with exactly three stat colors and one authoritative implementation.

**Sequencing decision:** do not resume experimental target `t=3`, consume the untouched M5H holdout, or begin `t=4` yet. The corrected measurements make expanded-board `t=2` frontier containment the next problem to profile first; exact target-search reuse from M5H remains relevant, but the next package should be selected from the expanded frontier profile rather than assumed in advance.
---

## M6B — Expanded t=2 frontier containment

M6B closes as **Outcome B**. Exact profiling shows that the 15-emblem `t=2` slowdown is predominantly intrinsic frontier growth rather than a missing aggregation/transposition cache. Existing compact transitions aggregate at banner ID before downstream work; terminal evaluation is canonical BoardStateID-memoized; role-local scoring/target preparation already reuses unchanged banners; and target pair/suffix caches do not capacity-thrash. The expanded target case reaches 17,862 target scalar states and 1.384B exact scenario checks, while pair/suffix cache construction is a small fraction of total target-kernel time.

**Sequencing decision:** do not manufacture another exact cache. The next bounded package should calibrate expanded-board-specific `t=2` approximation candidates against frozen exact expanded oracles before any production change. Do not reuse M5C/M5D/M5H calibration conclusions without fresh expanded-board validation. Production stays `legacy_3` / `t<=2`; do not resume target `t=3`, consume the M5H holdout, or begin target `t=4` yet.

---

## M6C — Expanded t=2 approximation calibration

M6C closes as **Outcome B**. The preregistered bounded approximation family did not pass the frozen fidelity/performance gates; retain exact expanded_5 t=2 as reference. Production remains `legacy_3` with horizon <=2. M5H holdout remains untouched and target t=3/t=4 remain frozen.

---

## M6D — Expanded t=2 adaptive exact certification

M6D closes as **Outcome A**. A frozen staged K=2 → K=4 → K=6 → exact-fallback policy validated on a fresh one-shot expanded_5 t=2 holdout with exact root agreement and material aggregate speedup. The result supports a **separately frozen production-integration package**; M6D itself does not enable the policy. Production stays `legacy_3`, horizon <=2; M5H conclusions remain unchanged and target t=3/t=4 stay frozen.

---

## M6E — Expanded t=2 production integration

M6E closes as **Outcome A / production integration passed**. The unchanged M6D-certified `adaptive-tight` policy is now the normal production search path only for `expanded_5` at modeled horizon `t=2`. `legacy_3` remains on the established exact path, `expanded_5` t=0/1 remains exact, and explicit engineering horizon overrides remain exact so historical M6C/M6D oracle tooling retains its pre-M6E semantics.

The production route validates the committed M6D certification artifacts at build/runtime boundaries. Invalid policy configuration, integration invariant failure, or unresolved ambiguity after K=6 falls back to exact evaluation. The product exposes no K-stage controls; board geometry remains the existing `legacy_3` / `expanded_5` selector.

The authoritative Node 22/Linux 12-case integration corpus achieved **100% root-action agreement**, **0 maximum expected-score regret**, and **0 maximum target-probability regret** versus exact. Median speedup was **1.66×**, P90 speedup **2.85×**, median structural work avoided **41.8%**, and exact fallback **41.7%**. The lower median speedup than M6D's 2.52× holdout result is explained by corpus mix: M6E intentionally contains more ambiguous integration cases and falls back exactly in 5/12 cases, which run near exact cost. No policy retuning occurred.

**Sequencing decision:** stop after M6E. Do not automatically resume target `t=3`, begin `t=4`, consume the untouched M5H holdout, or begin another optimization milestone. Any next package must be separately proposed and frozen.

## M6F outcome — board-layout UI and worker boundary

M6F completes the production boundary opened by M6A–M6E. The browser UI now exposes both supported canonical board layouts through one 3/5-emblem selector while retaining the three-emblem default. Layout construction and conversion are driven by `BOARD_LAYOUTS`; the UI does not duplicate slot-color geometry. Internally, 3 Emblems maps to `legacy_3` and 5 Emblems maps to `expanded_5`, but those identifiers remain implementation detail rather than normal product copy.

The optimizer is now invoked through `OptimizerWorkerClient → optimizer.worker → existing engine APIs`. Synchronous engine entry points remain intact for Node tests, benchmarks, and engineering tools. Active stale searches are cancelled by terminating the worker; request ids provide a second deterministic stale-response guard. Idle workers are reused so model loading and startup are amortized.

End-to-end regression coverage proves exact worker/synchronous recommendation parity, canonical 3↔5 conversion semantics, no token/menu mutation on layout changes, legacy routing preservation, and expanded t=2 routing through the frozen M6E `adaptive-tight` policy with existing exact fallback semantics. M6F makes **no changes** to M6D/M6E search configuration or t=2 semantics.

Browser measurements are recorded in `benchmarks/m6f-browser-performance.json` and summarized in `PERFORMANCE.md`. With this product/runtime integration complete, M6F stops; longer-horizon search remains a separate future milestone.


## M6G — UI/Application Layer Decomposition

**Outcome: complete.** M6G decomposed the M6F browser application without changing optimizer semantics or the established worker/runtime boundary.

- `M6G_BASE_SHA = 4e80f0a77be571f2e51734c935dcd3b7dd476c02`.
- Canonical browser/application state and optimizer-relevant mutation invalidation now live in `src/ui/state.ts`.
- Board rendering, controls, offered-action/result presentation, and plots are separated into `boardView.ts`, `controls.ts`, `actionView.ts`, and `plots.ts`.
- `src/ui/app.ts` is now the composition/bootstrap and optimizer-orchestration layer.
- Optimizer-relevant mutations invalidate displayed recommendations, cancel/supersede pending worker work, and remove stale highlights through one application-state boundary.
- The M6F route remains unchanged: legacy exact; expanded t=1 exact; expanded t=2 M6E adaptive-tight; unsupported adaptive cases exact fallback.
- Synchronous engine APIs and exact worker/synchronous parity remain preserved.
- `UI_APPLICATION_ARCHITECTURE.md` documents the final browser module boundaries.

M6G is the Phase-10 application-layer cleanup milestone. Longer-horizon search work remains separate and requires its own frozen package.


---

## M7A — Incremental target-kernel work reuse

M7A closes as a **negative profiling result**. The M5H screen→refine path already shares terminal `BoardStateID` evaluation through one `TerminalSearchRuntime`; unchanged role preparation is reused by `preparedRoleCache`; pair samples and suffix bounds are reused inside `targetSearch.ts`; and transition mechanics are reused by the compact transition cache. Representative authoritative M5H calibration measurements showed about 68% pair-group and 97% suffix-summary reuse during refinement.

The expensive refinement work is primarily newly reached exact terminal/search frontier: across 22 completed representative adaptive runs, refinement added 344,840 new terminal scoring calls and 18.68B target scenario checks. Candidate preparation was a small minority of target-kernel time.

**Sequencing decision:** do not manufacture another exact reuse cache and do not reopen M5H adaptive threshold/candidate tuning on this premise. The M5H holdout remains untouched; production target horizon and M6E expanded-board routing remain unchanged; target `t=4` and `expanded_5 t=3` remain out of scope. Any next deep-search package must attack a different source of frontier cost and be frozen separately.
