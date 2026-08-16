# M6G — UI/Application Layer Decomposition

## Status

Implemented on `agent/m6g-ui-application-decomposition` pending final regression/smoke validation and draft PR review.

```text
M6G_BASE_SHA = 4e80f0a77be571f2e51734c935dcd3b7dd476c02
```

`ENGINEERING_ROADMAP.md` remains the architecture authority. This document records the M6G implementation and validation outcome.

## Objective

Decompose the M6F browser application into explicit UI/application responsibilities while preserving product behavior, optimizer semantics, the Web Worker boundary, and the frozen M6E adaptive-tight route.

No scoring, transition, legality, menu-mechanics, or search-policy changes are part of M6G.

## Final structure

```text
src/ui/
  state.ts             canonical application state + mutation invalidation
  controls.ts          static and dynamic control binding
  boardView.ts         board/emblem rendering + recommendation highlights
  actionView.ts        offered actions + recommendation/result presentation
  plots.ts             score histogram + team comparisons
  optimizerClient.ts   worker lifecycle/cancellation/stale-response guard
  optimizerWorker.ts   worker entry point
  app.ts               composition/bootstrap + optimizer orchestration
```

`app.ts` no longer implements emblem cards, banner construction, offered-action result diagrams, comparison plots, or raw DOM-to-domain mutation logic.

## Central invalidation invariant

All optimizer-relevant state mutations pass through `ApplicationState`. Each mutation emits one invalidation event. The composition layer handles that event by:

```text
optimizerClient.invalidate()
→ discard current recommendation snapshot
→ clear recommendation/action highlights
→ mark recommendation/ranking presentation stale
→ preserve non-optimizer presentation state where appropriate
```

This makes stale-result protection a state-boundary invariant rather than a collection of ad hoc event-handler calls.

Presentation-only state changes, specifically theme and comparison-role selection, do not invalidate optimizer state.

## Preserved runtime boundary

```text
ApplicationState
    ↓ optimizerState()
canonical OptimizerState
    ↓
OptimizerWorkerClient
    ↓
optimizer worker
    ↓
workerRuntime
    ↓
existing engine APIs
```

M6G does not duplicate `BOARD_LAYOUTS`, operation mechanics, optimizer configuration, or M6E routing policy in presentation modules.

## Regression gates

The validation suite covers or retains coverage for:

- legacy three-emblem defaults;
- 3 ↔ 5 layout conversion;
- reset preserving the selected layout;
- token and menu mutation rules;
- legacy optimizer routing;
- expanded t=2 adaptive-tight routing;
- exact fallback;
- worker/synchronous recommendation parity;
- worker cancellation and stale-response suppression;
- centralized stale-presentation invalidation;
- deterministic tie-breaking through unchanged engine tests;
- generated deployment reproducibility;
- application-module boundary constraints.

## Build/runtime impact

M6G is an application-layer refactor, not a search-performance milestone. No search retuning or new performance campaign is performed. Material source/bundle/runtime changes are recorded only if observed during final validation.

## Non-goals preserved

M6G does not retune M6D/M6E, alter t=2 semantics, resume target t=3, begin t=4, consume the M5H holdout, redesign scoring/transitions/menu mechanics, add another layout, introduce a frontend framework, parallelize search, or add unrelated product features.

## Final validation record

To be finalized before the draft PR is opened:

```text
build/tests                          = pending final run
UI behavior regressions             = pending browser smoke
optimizer recommendation regressions = pending final run
M6E policy changes                  = 0 by scope/source review
worker boundary preserved           = yes
stale-result protection preserved   = yes; centralized
app.ts responsibility concentration = materially reduced
generated-output verification       = pending final run
```
