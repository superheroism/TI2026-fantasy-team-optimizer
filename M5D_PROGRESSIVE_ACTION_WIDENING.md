# M5D — Progressive Action Widening

## Result

**Outcome B.** M5D implements deterministic progressive widening for distant fresh-menu operation branches, but the empirical calibration package could not be executed in the available agent environment without either substituting the exact statistical-model input or using a restricted temporary repository-side execution path. Neither compromise was accepted.

Production therefore remains capped at **two modeled token spends**, and no M5C/M5D approximation is enabled by default.

This is an infrastructure-limited Outcome B, not evidence that progressive widening is inaccurate or too slow.

## Approximation boundary

M5D leaves the root policy untouched. Current visible-menu actions continue to evaluate every legal role with the existing full continuation path. Stop, menu reroll, token accounting, Dota mechanics, compact transition identity, scoring, and the exact menu operator are unchanged.

For a future fresh-menu state with more than one spend remaining, the engineering-only policy does the following:

1. evaluates a one-spend shallow value for every operation identity across every legal role;
2. ranks legal operations by descending shallow utility with stable operation-ID tie-breaking;
3. recursively deepens only the configured top K operations;
4. retains the shallow value for every legal operation outside K;
5. passes values for all operation identities to the existing exact fresh-menu operator.

A deferred legal operation is therefore never replaced by stop, zero, or negative infinity merely because it was not deepened.

The M5D per-call option is structurally ignored at modeled horizons `t<=2`.

## Frozen policies

M5C aggressive continuation compression remains the fixed background policy:

`4 → 2 → 1` retained fresh-menu outcome strata by recursive depth.

The only M5D widening candidates are:

| Policy | Deep operation cap by recursive depth |
|---|---|
| Wide | 12 → 8 → 4 |
| Medium | 8 → 5 → 3 |
| Narrow | 5 → 3 → 2 |

Depths beyond the listed schedule reuse the final cap. No schedule was retuned after the measurement lock.

## Implementation

M5D adds two narrow engine modules:

- `src/engine/actionWidening.ts` — immutable policy definitions, deterministic ranking/cap resolution, and widening diagnostics;
- `src/engine/actionWideningRuntime.ts` — run-scoped fresh-menu planning keyed by canonical state/tokens, including shallow values and the selected deep-operation set.

`optimizerContinuation.ts` provides the Dota adapter. Its shallow operation value is the best legal role value after applying the same depth-aware M5C fresh-menu outcome fidelity used at that recursive depth, with terminal utility used after the modeled one-spend transition. Selected top-K operations use the pre-existing recursive continuation evaluator.

The generic finite-horizon `V/Q` implementation remains unchanged and exact; Dota-specific widening stays outside it.

## Correctness coverage

The frozen implementation reached CI-green commit:

`3c36ee7f2eeb8634d32a23a20bd9dd4babbac397`

At that commit Node 22 CI passed typecheck, generated-artifact verification, and the complete test suite.

M5D-specific tests cover:

- Wide/Medium/Narrow depth schedules and terminal cap reuse;
- deterministic operation-ID ties;
- legal-operation counts below K;
- preservation of every operation identity in the menu value vector;
- shallow fallback for operations outside K;
- current-menu/root bypass of widening;
- a delayed-upside synthetic case where the shallow winner is not the deeper winner;
- complete expected-score and target-probability ranked-table equality at modeled horizons one and two when a widening option is supplied.

The frozen eight-case holdout was generated before calibration with seed `20260813` using real legal compact transitions. The first four cases are one-step reachable states and the last four are two-step reachable states. Illegal/duplicate draws are the only rejection conditions and are logged in `benchmarks/m5d-holdout-fixtures.json`.

## Measurement status

The specification requires isolated current-oracle, M5C-aggressive, and aggressive+Wide/Medium/Narrow `t=3` measurements before a policy may advance to the holdout or `t=4`.

Those measurements were not completed in this agent runtime. The repository connector exposes the exact large statistical-model blob, but the local execution sandbox could not materialize that immutable input directly; attempts to create a temporary repository-side calibration workflow were restricted. Rather than substitute data, infer benchmark results, or weaken the isolation/gating rules, M5D records the measurement gates as not executed.

Consequently:

- no widening policy is selected;
- the frozen holdout is preserved and not used for tuning;
- the combined 20-case gate is not claimed;
- the M5C interaction sentinel is not claimed;
- no M5D policy advances to `t=4`;
- no target-probability deep feasibility claim is made.

Machine-readable status is stored in:

- `benchmarks/m5d-proxy-rank-diagnostics.json`;
- `benchmarks/m5d-widening-calibration.json`;
- `benchmarks/m5d-widening-holdout.json`;
- `benchmarks/m5d-four-token-benchmark.json`.

## Interpretation

The engineering result is still useful: the action-widening boundary is implemented, deterministic, separately configurable, test-covered, and isolated from production `t<=2` semantics. What is deliberately missing is empirical evidence that any frozen K schedule satisfies the regret and runtime gates.

Therefore M5D does **not** justify changing production search depth or enabling either approximation by default.

## Next bounded step

Run the already-frozen M5D calibration package unchanged on a benchmark runner that can materialize the repository's exact data files. Do not alter the three K schedules, the 12 calibration fixtures, or the eight frozen holdouts before that run. This is the single next bounded step; no new search approximation should begin until the current M5D experiment receives its required empirical verdict.
