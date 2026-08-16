# M7A — Incremental Target-Kernel Work Reuse

## Status

Frozen work package.

Begin from current main.

```text
M7A_BASE_SHA = ae0daf5223d704f560d22a6daf7472dca4073ac6
```

`ENGINEERING_ROADMAP.md` remains the architecture authority. This document is the frozen M7A work-package authority.

## Context

M5H ended with Outcome C: adaptive target-probability t=3 could not simultaneously meet the frozen runtime and fidelity gates. Its principal follow-up recommendation was to eliminate duplicated exact target-search preparation/evaluation across screening and refinement before testing another adaptive policy.

M6A–M6G subsequently introduced and productionized versioned 3/5-emblem layouts, certified expanded-board t=2, added the worker boundary, and decomposed the UI. Those behaviors are now frozen.

## Objective

Reduce duplicated exact target-kernel work across repeated evaluations of the same root/state at different fidelity levels.

This is an exact search-infrastructure milestone, not a new approximation or horizon milestone.

Target concept:

```text
initial target evaluation
        ↓
reusable exact prepared state / partial work
        ↓
higher-fidelity refinement
        ↓
incremental continuation rather than recomputation
```

## Required work

### 1. Profile first

Measure the M5H screening/refinement path and identify exactly which work is repeated across fidelity passes:

- target-state preparation;
- role candidate preparation;
- prefix/pair/suffix structures;
- scenario evaluation;
- root-action transition preparation;
- other layout-independent reusable structures.

Quantify duplicated wall time and structural work before modifying behavior.

### 2. Design reusable target-search context

Introduce an explicit reusable context/cache boundary for exact target evaluation.

Requirements:

- keyed by canonical state/layout/objective inputs;
- safe across different continuation/widening fidelity settings;
- incremental where practical;
- no reuse across semantically different states;
- layout-aware for `legacy_3` and `expanded_5`;
- no UI/application coupling.

### 3. Preserve exact semantics

Do not change:

- target probability mathematics;
- M5C continuation schedules;
- M5D widening schedules;
- root-action eligibility;
- menu/stop semantics;
- transition probabilities;
- scoring;
- deterministic tie-breaking;
- M6E expanded_5 t=2 routing.

M7A may change how exact work is retained and reused, never which states are evaluated for a specified fidelity.

### 4. Equivalence coverage

For every reusable component, prove cold and reused evaluation produce identical:

- target probabilities;
- action values;
- root rankings;
- recommendations;
- deterministic ties.

Cover both layouts.

### 5. Benchmark scope

Primary deep-search benchmark:

```text
legacy_3 target-probability t=3
```

Use the existing M5H calibration corpus for engineering measurement.

Do not consume the untouched M5H holdout.

Also run:

- `legacy_3 t<=2` regressions;
- `expanded_5 t=2` regressions;

to prove the generalized implementation does not damage production paths.

Do not benchmark or expose `expanded_5 t=3` yet.

### 6. Decision gate

After exact reuse is implemented, rerun representative M5H adaptive screening/refinement workloads and determine whether reuse creates material headroom.

Record:

- runtime before/after;
- reused versus newly computed work;
- memory cost;
- root agreement;
- probability equivalence.

Do not retune adaptive thresholds or candidate schedules in M7A.

## Acceptance gate

M7A passes only if:

```text
exact semantic regressions             = 0
production recommendation regressions  = 0
M6E policy changes                     = 0
M5H holdout consumed                   = no
target t=4 begun                       = no
expanded_5 t=3 begun                   = no
duplicated target work                 = materially reduced
runtime improvement                    = demonstrated
memory growth                          = bounded/documented
build/tests/generated output           = green
```

If exact reuse does not materially reduce the M5H bottleneck, record that negative result and stop rather than adding approximation complexity.

## Deliverables

- `M7A_INCREMENTAL_TARGET_KERNEL_REUSE.md`
- reusable target-search context implementation
- exact-equivalence regression tests
- before/after Node 22 benchmarks
- `PERFORMANCE.md` update
- `ENGINEERING_ROADMAP.md` update
- draft PR

## Non-goals

Do not:

- consume the M5H holdout;
- retune M5H adaptive candidates;
- enable target t=3 in production;
- attempt `expanded_5 t=3`;
- begin t=4;
- modify M6E adaptive-tight;
- change board layouts;
- alter scoring, transitions, menu mechanics, or UI behavior.

## Exit criterion

M7A ends when exact cross-fidelity target-search work reuse is implemented, equivalence-proven, and measured.

The result should answer one question:

> Does eliminating duplicated exact work create enough computational headroom to justify a separately frozen second attempt at adaptive `legacy_3 t=3`?

Then stop.
