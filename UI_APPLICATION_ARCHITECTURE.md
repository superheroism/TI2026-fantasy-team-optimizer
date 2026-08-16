# UI / Application Architecture

## Purpose

The browser layer is intentionally thin. It owns interaction state and presentation, then hands a canonical optimizer snapshot across the M6F worker boundary. Scoring, mechanics, legality, search policy, and layout definitions remain outside presentation modules.

```text
UI / application state
        ↓
canonical BoardState / OptimizerState
        ↓
OptimizerWorkerClient
        ↓
optimizer worker
        ↓
worker runtime
        ↓
existing synchronous engine APIs
```

## Module boundaries

| Module | Responsibility |
|---|---|
| `src/ui/state.ts` | Canonical browser/application state and optimizer-relevant mutation boundary. |
| `src/ui/controls.ts` | DOM event binding for board, menu, layout, token, objective, and theme controls. |
| `src/ui/boardView.ts` | Banner/emblem rendering and recommendation highlights. |
| `src/ui/actionView.ts` | Offered-action editors, action comparison results, and recommendation presentation. |
| `src/ui/plots.ts` | Selected-score histogram and team comparison plots. |
| `src/ui/optimizerClient.ts` | Worker lifecycle, request IDs, cancellation, and stale-response suppression. |
| `src/ui/app.ts` | Bootstrap, composition, selected-board refresh, and orchestration across the modules above. |

## State invariant

Every optimizer-relevant mutation is performed through `ApplicationState` and emits one invalidation event. The application-level invalidation handler:

1. invalidates the active `OptimizerWorkerClient` request;
2. clears the last recommendation snapshot;
3. removes recommendation highlights and action-result presentation;
4. marks score/recommendation presentation stale;
5. preserves presentation-only state, such as the selected comparison role or theme, where appropriate.

Theme and comparison-tab changes are presentation-only and do not invalidate optimizer state.

## Authoritative boundaries

`BoardState`, `OptimizerState`, `BOARD_LAYOUTS`, operation definitions, transition mechanics, scoring, and search routing remain authoritative outside the presentation layer. UI modules may render derived values or legal choices supplied by domain/data modules, but they do not implement optimizer policy.

The M6F routing contract is unchanged:

- `legacy_3`: existing exact production route;
- `expanded_5`, t=1: exact route;
- `expanded_5`, t=2: frozen M6E adaptive-tight route;
- unsupported adaptive cases: existing exact fallback.

The synchronous engine APIs remain available for tests and non-browser consumers. The browser recommendation path remains worker-backed.

## Generated output

`src/` remains canonical source. `build/` and `docs/` JavaScript are generated from it by the existing build process. M6G adds generated counterparts for the new UI modules but does not change the source/generated ownership policy.
