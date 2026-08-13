# M3 Fast State Engine — canonical state identity

This work package starts M3 without changing search policy or introducing dynamic programming.

## Encoding

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

This separation is important for later M3 transition caching: the same banner mechanics should not acquire different transition identities merely because expected series changed.

## Validation

`tests/state-encoding.test.mjs` exhaustively enumerates all 150 emblem states in every role/slot and all 3,375,000 slot-valid three-emblem encodings for each of Core, Mid, and Support (10,125,000 encodings total). The test verifies canonical sequence identity and round-trip encoding. This identity layer deliberately represents some globally illegal combinations (for example duplicate stats); legality remains the Rules/Transition layer's responsibility.

Board packing is checked at radix boundaries and representative mixed values. Full Cartesian enumeration of board IDs is intentionally impossible because the board space is `3,375,000³`; collision freedom follows directly from the exhaustively tested banner radix plus fixed-radix board packing.

The adapters also verify exact `BoardState → EngineState → BoardState` reconstruction with explicit context and reject stale/non-canonical explicit slot color/position values instead of silently encoding them.

## Identity benchmark

Run after a normal build:

```text
node scripts/benchmark-state-identity.mjs
```

The benchmark warms each implementation and reports the median of five runs. A local Node 22.16.0 run with 250,000 keys per round measured approximately:

```text
banner key: 3.4× faster than nested JSON.stringify
board key:  3.1× faster than nested JSON.stringify
```

Absolute timings are machine-dependent; the benchmark is intended to compare identity-generation overhead on the same runtime.

## Deliberately deferred

- transition generation on compact IDs;
- transition caches/precomputation;
- scenario-bank reuse;
- menu operator changes;
- any DP/value-function work.

Those remain later M3/M4 packages under `ENGINEERING_ROADMAP.md`.
