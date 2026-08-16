# M3 Fast State Engine — canonical state and compact transitions

M3 changes engine identity and transition/search representation without changing search policy or introducing dynamic programming.

## Canonical encoding

Immutable slot properties are implicit in `(role, position)` and validated at the `BoardState` adapter boundary. The compact emblem ID stores only variable mechanics:

```text
stat index within slot color pool × quality tier × trait
6 × 5 × 5 = 150 states per emblem
```

A role-local banner ID is one mixed-radix integer over its three emblem IDs:

```text
e0 + 150 × (e1 + 150 × e2)
```

That gives 3,375,000 canonical banner encodings. A complete board ID is a `bigint` mixed-radix packing of Core, Mid, and Support banner IDs in fixed role order.

`selectedTeam` and `expectedSeries` are intentionally excluded from engine state. Neither changes under a reroll transition: team selection is free UI/roster state, while expected series is fixed scoring context for an optimization run. Exact `BoardState` reconstruction therefore uses an explicit `BoardAdapterContext` carrying both values for each role. Existing scoring-cache semantics are preserved by compatibility keys that add role and `expectedSeries` around the compact ID.

## Compact transition model

`src/engine/compactTransitions.ts` implements exact compact-state equivalents of every current operation class:

- stat reroll;
- quality reroll;
- trait reroll;
- random quality increase;
- quality redistribution.

The transition hot path decodes only the three compact emblem IDs in the targeted banner and constructs changed emblem/banner IDs directly. It does not materialize or clone a nine-emblem `BoardState`. The two unchanged role-local banner IDs are reused when constructing each next `EngineState`.

The reference descriptive implementation remains in `src/engine/transitions.ts` for equivalence testing.

### Transition cache

Transition distributions are cached at the narrow mechanics boundary:

```text
role × banner state ID × operation mechanics
```

The operation key includes the fields that can alter transition probabilities, including stat weights and uniform-fallback behavior. It intentionally excludes selected roster, expected series, objective, target score, and other scoring-only context.

Diagnostics expose:

- cache hits / misses;
- unique transition calculations;
- outcomes before / after aggregation;
- transition-generation time.

Outcome aggregation uses canonical numeric banner IDs rather than serialized boards.

## Search integration

`optimizer.ts` converts the input `BoardState` to `EngineState` once at the search boundary. First-step actions, stratified continuation, future-menu evaluation, scalar utility memoization, and deduplication then use canonical state IDs.

`BoardState` remains the descriptive/scoring-boundary representation. A hypothetical engine state is materialized only when a scoring function needs it, and that conversion is memoized by `BoardStateID`. No `EngineState → BoardState → mutate → EngineState` loop exists in transition enumeration.

Search horizon, objective, deterministic probability stratification, menu model, stochastic scoring fidelity, and pruning semantics are unchanged.

## Validation

`tests/state-encoding.test.mjs` exhaustively enumerates all 150 emblem states in every role/slot and all 3,375,000 slot-valid three-emblem encodings for each of Core, Mid, and Support (10,125,000 encodings total). It verifies canonical sequence identity, round trips, board packing, and adapter rejection of stale immutable slot properties.

`tests/compact-transitions-equivalence.test.mjs` compares the retained descriptive reference implementation against the compact implementation over operation-specific exhaustive state spaces:

- every legal three-slot stat-index configuration for each role and every stat-reroll scope in the action catalogue;
- every `5³ = 125` quality configuration for each role across ordinary quality rerolls, random quality increase, and redistribution;
- every `5³ = 125` trait configuration for each role across all trait-reroll scopes;
- weighted stat outcomes and no-uniform-fallback behavior;
- Tier-I / Tier-V floor/cap waste, random target selection, duplicate-stat exclusion, probability aggregation, and total-probability checks.

The established optimizer regression suite remains in place and the same-runner benchmark verifies identical recommendation and utility outputs before/after M3.

## Benchmarks

The first M3 package's identity benchmark remains available as:

```text
node scripts/benchmark-state-identity.mjs
```

It previously measured compact banner/board mechanics-key generation at roughly 3× the nested-serialization baseline on the same local runtime.

The normal benchmark now also measures reference transition generation, compact cold/warm transition generation, transition-cache diagnostics, and a scoring-boundary allocation proxy. `benchmarks/m3-precompact-baseline.json` and `benchmarks/m3-postcompact-benchmark.json` were produced sequentially on the same Node 22 GitHub runner.

Representative results:

| Workload | `main` before M3 compact transitions | compact M3 | Change |
|---|---:|---:|---:|
| Reference/compact cold transition suite, 60 operation-role calls | 4.09 ms | 3.29 ms | -19.6% |
| Default optimizer cold | 1,253 ms | 1,080 ms | -13.8% |
| Quality-heavy optimizer cold | 1,357 ms | 1,195 ms | -12.0% |
| Stat-heavy optimizer cold | 1,210 ms | 1,096 ms | -9.4% |
| Global-quality optimizer cold | 1,164 ms | 1,021 ms | -12.3% |
| Trait-heavy optimizer cold | 1,069 ms | 994 ms | -7.0% |
| Target-55k optimizer cold | 4,962 ms | 4,727 ms | -4.8% |

The compact warm transition cache served 15,000 operation-role calls in 28.5 ms with 15,000 hits and zero transition calculations. The transition microbenchmark reports zero descriptive `BoardState` allocations inside compact transition enumeration; scoring-boundary materializations are separately counted by optimizer diagnostics.

Warm whole-optimizer calls also improve substantially, but those timings combine transition-cache reuse with existing scoring caches and should not be presented as transition-only speedups.

## M3 completion assessment

The `ENGINEERING_ROADMAP.md` Phase-3 exit criterion is:

> Search primarily operates on canonical state IDs rather than serialized board objects.

That criterion is now met:

- canonical emblem/banner/board identity is collision-tested;
- transition enumeration operates directly on compact IDs;
- transition caching is banner-ID based;
- transition/search deduplication and scalar memoization use canonical board IDs;
- descriptive board construction is confined to explicit UI/scoring boundaries;
- exact transition and recommendation semantics are regression-tested.

**M3 is complete after this work package.** Reusable stochastic scenario generation/evaluation is not missing M3 work: the roadmap explicitly assigns it to **Phase 4 — Rebuild simulation around reusable scenarios**. M4 should therefore begin with that scenario-bank milestone, not with `V(B,t)` / dynamic programming unless the roadmap is deliberately revised.

## Explicitly not introduced

- dynamic programming or `V(B,t)` / `Q(B,M,t)`;
- exact future-menu combinatorial operator changes;
- deeper lookahead;
- scenario-bank reuse;
- Web Workers;
- adaptive precision;
- UI state refactors.
