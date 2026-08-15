# M6A — Versioned Board Layout Architecture

**Status:** implementation / validation  
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
- random matching scopes: uniform over the actual matching slot count.

Transition-cache identity includes layout and role before banner/operation identity, preventing cross-layout reuse.

### Unresolved expanded operation

`quality_redistribution` remains fully supported for `legacy_3`, where the verified mechanic is one randomly decreased slot and the other two increased.

For `expanded_5`, the current rule definition does not establish how the two increases are chosen from the remaining four slots. M6A does **not** infer that behavior. The operation therefore produces no expanded transition and is treated as unavailable pending authoritative client evidence.

That is an intentional Outcome-B safeguard, not an approximation.

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
- explicit expanded redistribution unavailability;
- transition-cache isolation across layouts.

Authoritative Node 22 CI and benchmark evidence is recorded in the final section once the branch benchmark completes.

## Performance measurement

Committed deterministic inputs:

- `benchmarks/m6a-layout-legacy-fixtures.json`
- `benchmarks/m6a-layout-expanded-fixtures.json`

Authoritative output:

- `benchmarks/m6a-layout-comparison.json`

The comparison records codec throughput, terminal scoring, transition cold/warm behavior and branching, optimizer `t=1`, expected-score `t=2`, target-probability `t=2`, memory, cache diagnostics, and search-engine diagnostic counters. Timeout is reported as a result rather than hidden by reducing fidelity.

## Production decision

M6A does not authorize an expanded production board. Production remains:

```text
layout = legacy_3
horizon <= 2
```

The expanded layout is a representable, testable rules geometry behind the same engine. The next work package must be selected from the measured frontier growth rather than predetermined.

## Outcome

Final classification is **Outcome B** if the architecture/legacy gates pass while five-slot quality-redistribution semantics remain unverified. It becomes Outcome A only if authoritative client evidence resolves that operation within M6A without guessing.
