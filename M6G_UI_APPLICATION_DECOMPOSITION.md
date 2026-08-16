# M6G — UI/Application Layer Decomposition

## Status

Complete on `agent/m6g-ui-application-decomposition`; ready for draft PR review.

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

## Browser smoke

Headless Chromium smoke validation covered:

- initial `legacy_3` load;
- switching to `expanded_5`;
- board edits;
- menu edits;
- expanded optimizer execution;
- an optimizer-relevant edit during an active worker request;
- zero stale recommendation highlights after that edit;
- reset preserving the selected expanded layout;
- switching back to `legacy_3`;
- repeated unchanged optimizer runs with deterministic recommendation presentation.

The smoke run passed all checks.

## Build/runtime impact

M6G is an application-layer refactor, not a search-performance milestone. No search retuning or new performance campaign was performed. No material engine/runtime behavior change was observed during validation.

## Non-goals preserved

M6G does not retune M6D/M6E, alter t=2 semantics, resume target t=3, begin t=4, consume the M5H holdout, redesign scoring/transitions/menu mechanics, add another layout, introduce a frontend framework, parallelize search, or add unrelated product features.

## Final validation record

```text
build/tests                           = green; 235/235
UI behavior regressions              = 0 in browser smoke
optimizer recommendation regressions = 0
M6E policy changes                   = 0
worker boundary preserved            = yes
stale-result protection preserved    = yes; centralized and browser-tested
app.ts responsibility concentration  = materially reduced
generated-output verification        = green
browser smoke                        = pass
```
