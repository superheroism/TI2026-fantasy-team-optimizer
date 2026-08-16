# M6F — Board-Layout UI and Worker Integration

**Status:** implementation in validation  
**Base SHA:** `cf03a20e601242810e4101415eb4989a8cae646c`  
**Architecture authority:** `ENGINEERING_ROADMAP.md`

## Scope

M6F exposes both canonical board layouts through the production UI and moves recommendation/search execution behind a browser Web Worker. It does not change scoring, transitions, objectives, modeled horizon, or the M6D/M6E `adaptive-tight` policy.

## Board-layout contract

The only product-facing geometry control is a segmented selector labeled **3 Emblems** and **5 Emblems** in the Current Board header.

Internal mapping:

```text
3 Emblems → legacy_3
5 Emblems → expanded_5
```

Those internal identifiers are not shown in normal UI copy.

Board geometry comes only from `BOARD_LAYOUTS`. Expanded colors therefore remain:

```text
Core     red, green, red, green, red
Mid      red, blue, green, red, green
Support  blue, green, blue, green, blue
```

`createDefaultBoard()` and `convertBoardLayout()` centralize deterministic layout-aware construction. New slots use centrally defined legal defaults; UI code does not carry a second color map.

### Conversion semantics

- **3 → 5:** preserve slots 1–3 exactly, selected team, and expected series; create slots 4–5 from deterministic legal defaults.
- **5 → 3:** preserve slots 1–3 exactly, selected team, and expected series; discard slots 4–5.
- **Layout change:** does not consume tokens or change the offered menu; prior recommendation/result highlights are invalidated.
- **Reset Board:** constructs a fresh board in the currently selected layout.
- Default sessions remain 3 Emblems / legacy behavior for backward compatibility.

## Worker boundary

Production browser flow is:

```text
UI
  → OptimizerWorkerClient
    → optimizer.worker
      → runOptimizerWorkerRequest
        → recommendNextAction
```

The existing synchronous `recommendNextAction()` engine API remains unchanged for Node tests, benchmarks, and engineering tooling.

The worker loads the immutable statistical/title model once from deployment-root data assets, avoiding transfer of the large model bundle on every optimization request. UI state is sent through structured clone as the canonical `OptimizerState`; the existing recommendation contract is returned unchanged together with engine diagnostics and worker timing metadata.

## Supersession and cancellation

Every request receives a monotonically increasing request id.

- Starting newer optimization supersedes a pending request.
- Board edits, layout changes, reset, or optimizer-relevant control changes invalidate pending work.
- Pending stale work is cancelled with `Worker.terminate()` and its promise is rejected with `OptimizerRequestCancelledError`.
- Response ids are still checked before acceptance, providing deterministic stale-response suppression if a late message races with invalidation.
- An idle worker is retained across edits for warm reuse; only active stale work is terminated.

No fake progress percentage is exposed.

## Production routing

The worker invokes the same production engine entry point as synchronous callers. Consequently:

```text
legacy_3 production → established exact route
expanded_5, t=1     → exact route
expanded_5, t=2     → M6E adaptive-tight route
M6E ambiguity/error → existing exact fallback
```

No UI-specific expanded representation or policy override exists.

## Regression gates

M6F adds coverage for:

- legacy default and 3/3/3 rendering geometry;
- expanded 5/5/5 canonical colors;
- exact first-three-slot preservation across 3 → 5 → 3;
- team/expected-series preservation;
- reset preserving selected layout;
- layout conversion preserving tokens and menu;
- worker-runtime versus synchronous recommendation parity;
- expanded worker path reaching M6E `adaptive-tight` at t=2;
- request cancellation/stale-response suppression;
- product UI exposing both layouts while hiding internal layout ids;
- browser UI no longer calling `recommendNextAction()` synchronously.

## Generated/deployment assets

TypeScript builds `optimizerClient.js`, `optimizer.worker.js`, and `optimizerWorkerRuntime.js` into `build/js/ui/`; the normal build copies those assets unchanged into `docs/js/ui/`. `site/` remains the canonical HTML/CSS source.

## Performance characterization

Browser-oriented measurements are recorded in `PERFORMANCE.md` and the M6F benchmark artifact. They characterize main-thread blocking, worker wall time, startup/warm reuse, heap behavior, and request-transfer overhead without retuning M6E.

## Exit rule

M6F stops after both layouts are usable through the production UI, worker/synchronous semantics are proven equivalent, stale recommendations cannot render, generated deployment assets are reproducible, and browser measurements are recorded. It does not resume target t=3 or begin t=4.
