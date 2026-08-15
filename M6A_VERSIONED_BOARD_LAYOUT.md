# M6A — Versioned Board Layout Architecture

**Status:** complete — Outcome A  
**Base:** `b058010829d7b48c5968d2540acf65a40b64f2a7`  
**Production default:** `legacy_3`, modeled horizon `<= 2`

## Purpose

M6A generalizes the optimizer from one fixed three-emblem geometry to a versioned board-layout/ruleset boundary without changing current production behavior. The compact-state design remains intact: mutable emblem state is encoded, while physical slot properties remain implicit in `layout × role × slot`.

This package deliberately does not resume experimental target `t=3`, consume the M5H holdout, change M5C/M5D schedules, add a search approximation, or expose the expanded board as the production default.

## Frozen layouts

The pre-M6A implementation was inspected before migration. Its actual legacy geometry is:

```text
legacy_3
Core     Red   Green  Red
Mid      Red   Blue   Green
Support  Blue  Green  Blue
```

The new representable geometry is:

```text
expanded_5
Core     Red     Green  Red     Green  Red
Mid      Red     Purple Green   Red    Green
Support  Purple  Green  Purple  Green  Purple
```

Slot position remains part of identity when colors repeat.

### Purple and stat legality

M6A treats Purple as a physical slot color introduced by the expanded geometry. It maps to the existing blue-stat legality pool. This preserves the package invariant that M6A introduces no new stat pool or scoring stat definition.

## Ruleset and layout boundary

`src/domain/rules.ts` now owns:

- `BoardLayoutId` / `BoardLayout` geometry;
- the frozen `legacy_3` and `expanded_5` definitions;
- a minimal `Ruleset` boundary;
- the production default ruleset/layout;
- color-specific stat legality.

Search, scoring, transitions, and rendering consume layout-defined slots rather than defining geometry themselves.

## State encoding

The high-level engine representation remains:

```text
EngineState
  layoutId
  coreBannerId
  midBannerId
  supportBannerId
  canonicalBoardId
```

Each banner still encodes only mutable emblem state:

```text
stat × quality × trait
```

The banner codec is now layout-aware and supports either three or five physical slots.

### Legacy BoardStateID compatibility

M6A preserves the complete pre-M6A numeric namespace for `legacy_3`. Existing raw legacy board IDs retain their old mixed-radix values and the compatibility decoder retains its pre-M6A three-component API.

`expanded_5` board IDs occupy a disjoint canonical range beginning after the complete legacy board-ID namespace. `decodeVersionedBoardStateId()` resolves layout plus the three banner components. Therefore a numerically identical set of banner components can never alias across layouts.

This chooses the work package's versioned-canonical-identity strategy without forcing raw expanded IDs into the old namespace.

### Descriptive boundary

`BoardState` remains the UI/descriptive representation. Pre-M6A board objects that omit `layoutId` resolve unambiguously to `legacy_3` at the adapter boundary. Expanded boards carry `layoutId: "expanded_5"` explicitly.

Adapters validate slot count, physical position, physical color, and color-specific stat legality before compact encoding. Existing legacy round trips remain byte-for-byte descriptive-state compatible by omitting a newly invented `layoutId` property on decoded legacy fixtures.

## Transitions

Compact and descriptive/reference transition paths now enumerate layout-defined slot sets. Known operation semantics generalize naturally:

- stat reroll: every matching physical slot implied by scope, with existing same-color pool and duplicate-stat rules;
- quality reroll: every matching physical slot implied by scope;
- trait reroll: every matching physical slot implied by scope;
- random quality increase: one uniformly selected physical slot from the complete banner, including Tier-V cap waste;
- random matching scopes: uniform over the actual matching slot count;
- quality redistribution: one uniformly selected slot decreases, then two distinct recipients are selected uniformly from all unordered pairs among the remaining slots; all other slots remain unchanged.

The five-slot redistribution recipient rule was supplied as authoritative project input after the initial Outcome-B draft: **two of the remaining four slots increase, chosen randomly**. M6A implements that rule without altering any other quality-transition semantics.

For `expanded_5`, each decreased slot has four possible remaining slots and therefore `C(4,2) = 6` equally likely recipient pairs. Conditional on the decreased slot, each pair has probability `1/6`. With five uniformly likely decreased slots, each source/pair selection has probability `1/30` before tier-change probabilities and cap/floor aggregation are applied.

For `legacy_3`, this same definition is exactly the established mechanic: after one of three slots is chosen to decrease, only one pair remains, so the other two increase. No legacy transition semantics change.

Directional quality outcomes preserve the existing rules: a selected increase is uniform over all higher tiers, a selected decrease is uniform over all lower tiers, and Tier-I/Tier-V selections retain existing floor/cap waste. Final states reached through multiple stochastic paths are aggregated exactly.

Transition-cache identity includes layout and role before banner/operation identity, preventing cross-layout reuse.

## Trait and quality evaluation

The existing banner-level trait definitions were rewritten to iterate the complete banner rather than fixed positions `0/1/2`:

- adjacency uses physical neighboring positions;
- Unique counts the complete banner;
- Friendly counts the complete banner using its existing activation threshold;
- Fractal evaluates the existing all-qualities-different definition over the complete banner;
- Vampiric adjacency remains positional.

No trait coefficient or quality transition distribution changed.

## Scoring

Role scoring now supports a variable number of emblem stats and builds the corresponding selected covariance matrix. The legacy three-stat path deliberately retains the pre-M6A `cholesky3` and three-normal correlated-uniform kernel so the migration does not perturb legacy deterministic Monte Carlo streams.

Five-stat boards use the generic N-dimensional Cholesky/sampling path. Roster/title optimization remains free and search-objective semantics are unchanged.

## UI

The board renderer is slot-driven: it renders the current banner's emblem array rather than manually constructing three cards. DOM synchronization and operation-target visualization likewise use physical slot indices from the current board.

No normal user-facing layout toggle was added. The application default remains the unversioned legacy descriptive board, which resolves to `legacy_3`.

## Compatibility evidence

The existing regression suite remains the primary non-waivable legacy gate. In particular, the pre-existing exhaustive state-encoding corpus freezes all `150^3` legacy banner IDs by role, board-ID composition/decomposition, adapter round trips, and immutable slot validation.

M6A adds expanded-layout tests for:

- exact physical geometry;
- Purple-to-blue-pool legality mapping;
- five-slot banner and board round trips;
- cross-layout board-ID isolation;
- random selection among five slots;
- random selection among repeated Purple slots;
- five-slot duplicate-stat pressure under all-color stat rerolls;
- probability normalization and aggregation;
- expanded quality redistribution with all five possible decreased slots and all six recipient pairs per source;
- a symmetric all-Tier-III redistribution fixture producing 240 equiprobable final transition states;
- exact equality between descriptive/reference and compact redistribution distributions;
- Tier-I/Tier-V floor/cap-waste normalization;
- exact legacy three-slot redistribution combinatorics (24 equiprobable all-Tier-III outcomes);
- transition-cache isolation across layouts.

A one-shot finalization workflow regenerated `build/` and `docs/`, ran the fresh Node 22 benchmark matrix, and then ran the complete test suite against the regenerated artifacts. Build, benchmark, tests, and evidence commit all completed successfully. The temporary finalization workflow was removed afterward rather than becoming permanent repository machinery.

## Performance measurement

Committed deterministic inputs:

- `benchmarks/m6a-layout-legacy-fixtures.json`
- `benchmarks/m6a-layout-expanded-fixtures.json`

Authoritative output:

- `benchmarks/m6a-layout-comparison.json`

The final comparison was generated on Node `v22.23.2`, Linux x64, after expanded quality redistribution was enabled. It completed all 12 cases with no benchmark error or timeout.

Fresh expanded/legacy optimizer-runtime ratios were:

| Workload | Expanded / legacy |
|---|---:|
| Stat-heavy `t=1` | 0.24×* |
| Stat-heavy `t=2` | 1.95× |
| Quality-heavy `t=2` | 4.21× |
| Trait-heavy `t=2` | 2.33× |
| Global-quality `t=2` | 3.34× |
| Target-probability `t=2` | 1.93× |

`*` The isolated `t=1` wall-time ratio is noisy and should not be interpreted as a structural expanded-board speedup. Its state counts still increase; the production-relevant `t=2` comparisons are the more informative result.

The global-quality comparison is now semantically apples-to-apples because five-slot redistribution is fully enabled rather than omitted. The expanded target-probability `t=2` case took about **7.48 s** versus about **3.87 s** for legacy in this run.

The comparison records codec throughput, terminal scoring, transition cold/warm behavior and branching, optimizer `t=1`, expected-score `t=2`, target-probability `t=2`, memory, cache diagnostics, and search-engine diagnostic counters. Timeout is reported as a result rather than hidden by reducing fidelity.

The structural conclusion is unchanged but stronger: terminal scoring remains roughly flat while transition/frontier breadth grows substantially. Representative stat-heavy one-step branching is still 5 → 21 outcomes. With expanded redistribution enabled, global-quality frontier pressure becomes materially larger as well. The 15-emblem production-horizon search therefore needs frontier-oriented profiling before deeper-search work resumes.

## Production decision

M6A does not authorize an expanded production board. Production remains:

```text
layout = legacy_3
horizon <= 2
```

The expanded layout is now fully representable and its known operation mechanics are defined and tested through the same engine. Promotion of `expanded_5` to the production default remains a separate product/ruleset decision.

## Outcome

Final classification: **Outcome A**. Legacy compatibility passes; expanded geometry, codecs, legality, transitions, scoring, caches, and UI paths are layout-aware; five-slot quality redistribution is defined as one random decrease plus two uniformly selected distinct recipients from the remaining four; and the fresh Node 22 benchmark/test finalization completed successfully.

Production remains `legacy_3` / `t<=2`. The next package should be selected from the measured expanded-board frontier profile. Do not resume target `t=3`, consume the M5H holdout, or begin target `t=4` in M6A.
