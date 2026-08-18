# Engineering overview

This document describes the optimizer as it works today. Detailed milestone reports and experimental history are kept in `engineering/history/`.

## Design principles

The optimizer follows four main rules:

- Keep Dota mechanics, statistical inputs, scoring, search, and UI concerns separate.
- Preserve a descriptive board model for the UI and a compact canonical representation for search.
- Reuse simulated tournament scenarios when comparing actions.
- Measure approximation error before using a faster search policy in production.

## System boundaries

```text
precomputed statistical model
 ↓
scoring engine
 ↑
search / policy
 ├─ menu model
 └─ transition model
 ↑
optimizer worker
 ↑
UI
```

Rules determine what is legal. Statistical inputs describe possible team and role outcomes. Scoring determines the value of a board. Search chooses among stop, menu reroll, and board-changing actions.

This separation lets performance work change search internals without silently changing game mechanics or the statistical model.

## Board state

The UI uses readable board objects. Search uses compact canonical IDs for each emblem, banner, and board.

An emblem ID represents its variable state:

```text
stat × quality × trait
```

Properties that do not change, such as slot color and position, come from the board layout. Explicit adapters convert between descriptive and compact state.

The optimizer supports two versioned layouts:

- `legacy_3` — three emblems per role.
- `expanded_5` — five emblems per role.

Both layouts use the same rules and search architecture.

## Scoring and simulation

The scoring engine consumes precomputed team- and role-level stat distributions and role-specific correlation matrices. It generates correlated game outcomes, applies banner multipliers, and follows the Fantasy retention rules. See `MODEL.md` for the statistical inputs and provenance boundary.

Competing boards use shared simulated tournament scenarios. A reroll changes how those scenarios score; it does not require a new simulated tournament. This improves both runtime and action-to-action comparability.

The model still has known limits. It does not represent exact game-aligned covariance between paired Core or Support players, opponent effects, game duration, or one shared tournament-advancement path across all selected roles.

## Search

The production optimizer supports two objectives:

- expected final score;
- probability of reaching a selected target score.

At each decision, search compares:

- keeping the current board;
- rerolling the action menu;
- each visible action on every legal target.

After each possible board result, the optimizer re-evaluates free team and title choices.

The visible action uses its full modeled transition distribution. Deeper hypothetical continuation uses a smaller deterministic set of representative outcomes to control search growth.

## Finite-horizon value model

The search architecture uses a finite-horizon value function. Conceptually:

```text
V(board, tokens)
```

represents the best modeled final utility available from a board with a fixed number of token spends remaining.

Stopping, using an offered action, and rerolling the menu are alternatives within the same decision model. Compact board IDs and reusable scoring work make repeated state evaluation practical.

## Future menus

The default model treats a future menu as three distinct actions drawn uniformly from the 20-action catalog.

The optimizer evaluates this distribution analytically rather than enumerating all 1,140 possible three-action menus. A separate menu-model boundary remains available for non-uniform or empirical menu distributions.

## Production search routes

Production looks ahead at most two token spends.

| Layout | 0 tokens | 1 spend | 2 spends |
|---|---|---|---|
| 3 Emblems | terminal evaluation | full reference search | full reference search |
| 5 Emblems | terminal evaluation | full reference search | validated adaptive search with full-search fallback |

For five-emblem, two-spend decisions, the adaptive policy evaluates a small set of leading root actions first. It expands the set when the decision is close and falls back to full reference search when needed.

The selected policy matched full reference search on all 12 decisions in its preregistered holdout, with zero measured regret. This validates the policy on that frozen corpus; it does not prove equivalence for every possible board.

## Browser execution

Recommendation search runs in a Web Worker so multi-second calculations do not block the page. Requests carry identifiers so stale results cannot overwrite newer board state. Workers are periodically recycled to limit long-session cache growth.

The UI is split into state, controls, board rendering, action rendering, plots, worker communication, screenshot import, and application orchestration. See `UI_APPLICATION_ARCHITECTURE.md` for the module boundaries.

## Why production stops at two spends

The main limit is frontier growth: each additional decision depth creates many new boards and decisions that must be evaluated.

The project tested compact state, scenario reuse, transition caching, analytic menu evaluation, continuation compression, progressive action widening, and adaptive refinement. After these improvements, deeper search remained expensive because it reached genuinely new decision-relevant states rather than repeatedly performing the same avoidable work.

Production therefore remains capped at two modeled spends. Deeper search is research-only.

## Where to find more detail

- `MODEL.md` — statistical inputs, correlation model, simulation method, and provenance boundary.
- `CLIENT_RULES_2026.md` — mechanics and probability assumptions.
- `PERFORMANCE.md` — current runtime and memory baseline.
- `PRODUCT_DECISIONS.md` — product and modeling choices.
- `SCREENSHOT_IMPORT_PIPELINE.md` — screenshot-import architecture.
- `../engineering/history/` — milestone measurements, negative results, and experimental protocols.