# M7A — Incremental Target-Kernel Work Reuse

## Status

**Complete — negative profiling result; acceptance gate not met.**

```text
M7A_BASE_SHA = ae0daf5223d704f560d22a6daf7472dca4073ac6
```

`ENGINEERING_ROADMAP.md` remains the architecture authority. This document is the frozen M7A work-package authority and result record.

## Context

M5H ended with Outcome C: adaptive target-probability t=3 could not simultaneously meet the frozen runtime and fidelity gates. Its principal follow-up recommendation was to eliminate duplicated exact target-search preparation/evaluation across screening and refinement before testing another adaptive policy.

M6A–M6G subsequently introduced and productionized versioned 3/5-emblem layouts, certified expanded-board t=2, added the worker boundary, and decomposed the UI. Those behaviors are frozen.

## Objective

Determine whether duplicated exact target-kernel work across repeated evaluations of the same root/state at different fidelity levels remains large enough to justify a reusable/incremental exact-search context.

This is an exact search-infrastructure milestone, not a new approximation or horizon milestone.

## Profile-first result

M7A inspected current `main` plus the authoritative M5H Node 22/Linux raw calibration artifacts from workflow run `31895777023`. The profile intentionally used only the existing M5H calibration evidence; the untouched M5H holdout was not consumed.

Representative decision-sensitive measurements covered three calibration cases (`calibration-01 @ 60k`, `calibration-05 @ 55k`, and `calibration-09 @ 50k`) across all eight preregistered adaptive candidates. Twenty-two adaptive runs completed and two timed out.

Aggregated completed-run work:

| Pass | Root-evaluation wall time | New terminal scoring calls | Target scenario checks | Candidate preparation | Combinatorial target search |
|---|---:|---:|---:|---:|---:|
| Screen | 604.6 s | 1,551,648 | 78.78 B | 31.0 s | 464.1 s |
| Refine | 149.2 s | 344,840 | 18.68 B | 8.9 s | 113.4 s |

The refine pass did **not** re-score terminal `BoardStateID`s already evaluated by the screen. `runAdaptiveTargetSearch()` constructs one `TerminalSearchRuntime` and shares it across the screen and refine continuation runtimes; the terminal memo therefore survives the fidelity boundary.

The exact target kernel also already reuses the expensive preparation structures that M7A was expected to target:

| Exact target structure | Refine reuse rate across completed representative runs |
|---|---:|
| Pair-group cache | 68.1% hits |
| Suffix-summary cache | 96.8% hits |

Screen reuse was similar: 69.5% pair-group hits and 97.0% suffix-summary hits.

The architecture explains the measurements:

- `preparedRoleCache` is keyed by banner mechanics, title prefix, and iteration count, so unchanged role/banner preparation survives across terminal boards;
- `targetSearch.ts` retains prepared-candidate summaries, pair-group samples, and suffix summaries by stable prepared-array identity;
- the adaptive M5H driver shares one terminal scorer across screen and refine, preventing duplicate exact terminal-board evaluation;
- compact transition mechanics have a separate global transition cache, while per-fidelity continuation runtimes intentionally keep different value-function state because their continuation/widening semantics differ.

## Bottleneck diagnosis

The costly refinement work is predominantly **new exact work required by the higher-fidelity frontier**, not duplicated work from the screen.

For example, on `calibration-05 @ 55k`, A3 refinement added 25,889 previously unseen terminal states and about 1.67 billion target scenario checks. On `calibration-01 @ 60k`, A3 refinement added 50,628 new terminal states and about 2.45 billion scenario checks. Reusing the screen's approximate continuation values as exact refine values would change semantics and is therefore outside M7A.

Candidate preparation is also not the dominant remaining cost: across the representative completed refinements it accounted for about 8.9 s versus 113.4 s in combinatorial target search.

The same conclusion is consistent with M6B: exact target pair/suffix cache construction was already a small portion of expanded-board t=2 target-kernel time, and the dominant growth came from the intrinsic exact frontier.

## Reusable-context decision

A new exact reusable target-search context was **not implemented** because the profile did not identify a material semantically safe duplication boundary that the current architecture fails to reuse.

The obvious candidates are already covered:

1. repeated terminal board IDs — shared terminal memo;
2. unchanged role preparation — `preparedRoleCache`;
3. repeated pair samples — pair-group cache;
4. repeated suffix bounds — suffix cache;
5. repeated transition mechanics — compact transition cache.

The remaining screen/refine value-function work differs by fidelity policy. Sharing those values would not be exact work reuse; it would be a new approximation or a change to the specified M5C/M5D fidelity semantics.

Adding a second cache layer around already-reused structures would increase memory/complexity without evidence of material runtime headroom. Per the frozen stop condition, M7A stops here rather than manufacturing such a cache.

## Equivalence / production safety

Because no engine behavior changed:

- target probability mathematics are unchanged;
- M5C continuation schedules are unchanged;
- M5D widening schedules are unchanged;
- deterministic tie-breaking is unchanged;
- transition/scoring/menu semantics are unchanged;
- M6E `expanded_5 t=2` routing is unchanged;
- production recommendations are unchanged by construction.

No new semantic-equivalence test suite is required for a non-implementation result. Existing current-main test/build status remains the production baseline; M7A introduces documentation/evidence only.

## Acceptance gate

```text
exact semantic regressions             = 0 (no engine change)
production recommendation regressions  = 0 (no engine change)
M6E policy changes                     = 0
M5H holdout consumed                   = no
target t=4 begun                       = no
expanded_5 t=3 begun                   = no
duplicated target work                 = NOT materially reducible by identified exact reuse
runtime improvement                    = NOT demonstrated
memory growth                          = 0 from implementation (no implementation)
build/tests/generated output           = unchanged from main
```

Therefore **M7A does not pass the positive acceptance gate**. It exits under the explicitly allowed negative-result clause.

## Outcome

**Negative result.** Eliminating duplicated exact work does **not** appear to create the missing computational headroom, because the important exact preparation/evaluation layers already survive the M5H screen→refine boundary. The expensive refinement cost is mainly the newly expanded exact terminal/search frontier.

Answer to the exit question:

> **No. Current evidence does not justify a second adaptive `legacy_3 t=3` attempt on the premise that cross-fidelity exact-work reuse will recover substantial compute.**

A future deep-search package should target a different source of frontier cost, and must be frozen separately. Do not retune M5H against the preserved calibration/holdout evidence as part of M7A.

## Non-goals preserved

M7A did not:

- consume the M5H holdout;
- retune M5H adaptive candidates;
- enable target t=3 in production;
- attempt `expanded_5 t=3`;
- begin t=4;
- modify M6E adaptive-tight;
- change board layouts;
- alter scoring, transitions, menu mechanics, or UI behavior.
