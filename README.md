# Dota 2 Fantasy Optimizer 2026

A browser-based tool for building a TI 2026 Fantasy board, comparing team choices, and deciding how to spend the next reroll token.

The optimizer is distribution-aware: it models a range of plausible outcomes rather than ranking boards from simple averages alone.

## v1.0 production contract

v1.0 supports both **3 Emblems** (`legacy_3`) and **5 Emblems** (`expanded_5`), with either **Expected final score** or **P(score ≥ target)** as the optimization objective.

Production recommendation lookahead is capped at **two modeled token spends**:

| Layout | 0 tokens | 1 modeled spend | 2 modeled spends | More than 2 |
|---|---|---|---|---|
| 3 Emblems | terminal evaluation | full production-reference search | full production-reference search | not exposed as production search |
| 5 Emblems | terminal evaluation | full production-reference search | certified adaptive reference search with full reference fallback | not exposed as production search |

**Production-reference search** has a specific meaning here. The optimizer first defines a frozen production model: known Fantasy mechanics, explicit assumptions for unpublished reroll/menu probabilities, a fixed statistical player-performance model, and deterministic representative outcome strata for hypothetical continuation. Full reference search evaluates the complete action/value-function search defined by that model. It does **not** claim to enumerate every possible real-world tournament outcome or every modeled transition outcome at every future depth.

For the five-emblem two-spend route, the frozen adaptive policy spends less computation on clear root decisions and progressively refines close ones. It matched full reference search on all 12 decisions in its preregistered holdout, with zero measured regret, and used full reference fallback in 16.7% of those cases. That is validation against the frozen corpus, not a claim of universal mathematical equivalence. Deeper experimental search code is engineering-only and is not part of the v1.0 product contract.

See `ENGINEERING.md` for how the reference model was established, which alternatives were considered, and why these production boundaries were chosen.

## How to use it

1. Choose **3 Emblems** or **5 Emblems** in Current Board, then match your Core, Mid, and Support War Banners.
2. Select the team used for each role.
3. Enter your remaining roll tokens and the three actions currently offered in-game.
4. Choose an objective:
   - **Expected final score** for the highest average modeled outcome.
   - **P(score ≥ target)** if you care more about clearing a specific score threshold.
5. Run the optimizer.
6. Apply the recommended action in-game, then update the board and action menu for the next roll.

Core uses a team's position 1 + position 3 pair, Mid uses position 2, and Support uses position 4 + position 5. Core and Support player scores are averaged for that role.

For each emblem, you enter only the **stat**, **quality tier**, and **trait**. Effective multipliers are calculated automatically from the full banner state.

## How scoring is modeled

The simulator uses precomputed team- and role-level statistical distributions and models correlations among the stats on a banner. That matters because Fantasy keeps strong games rather than averaging every game equally.

For each role, the scoring order is:

```text
score each game
→ keep the best 2 games in a series
→ keep the best series in the scoring period
```

The final modeled score is:

```text
Core retained score + Mid retained score + Support retained score
```

The selected setup is evaluated with Monte Carlo simulation. The tool reports expected score, median score, P10/P90, and probability of reaching the selected target when a target is set. P10 and P90 are modeled downside/upside ranges, not guarantees.

The same underlying simulated performance scenarios are reused when comparing hypothetical boards. A reroll therefore changes how a common modeled performance scenario is scored instead of generating an unrelated tournament for every candidate action.

## What the optimizer compares

For each visible reroll action, the optimizer evaluates every legal Core, Mid, and Support target. For each possible result it recalculates the banner, re-optimizes the free team selections, and estimates the resulting board value.

The decision set includes every legal visible action/target, menu reroll when available, and keeping the best current setup. A menu reroll costs one token and preserves the board, so the optimizer does not force a damaging board change merely to continue.

When looking ahead, immediate visible actions use their full modeled transition distributions. Hypothetical continuation uses deterministic representative outcome strata to control state growth while keeping comparisons reproducible. This continuation fidelity is part of the frozen production reference model; it is described in `ENGINEERING.md`.

## Reroll model assumptions

Some reroll probabilities are not treated as known client odds. The current model assumes:

- a stat reroll is uniform over legal replacement stats after must-change and no-duplicate restrictions;
- an ordinary quality reroll is uniform over the other four tiers;
- a trait reroll is uniform over the other four traits;
- a directional quality change is uniform over valid tiers above or below the current tier;
- random quality operations choose eligible slots uniformly;
- a future action menu is a uniform draw of 3 distinct actions from the 20-action catalogue.

These are modeling assumptions, not claims about unpublished client probabilities.

## Current scope and limitations

v1.0 models team/role-specific stat distributions, cross-stat correlation within a banner, full-banner quality/trait effects, retained-game/series scoring, legal reroll outcomes, free team re-optimization after hypothetical board changes, and a two-spend finite decision horizon.

It does **not** model exact player-game covariance for Core/Support pairs, opponent-specific effects, game-duration effects, or a shared tournament-advancement path across selected roles. Search beyond two modeled spends remains post-v1.0 research. Title prefixes are optimized from modeled role boosts; the suffix is not assigned a fabricated numeric expected value.

## Board layouts

The Current Board selector supports both TI 2026 banner geometries. **3 Emblems** is the backward-compatible default; **5 Emblems** uses the expanded five-slot board. Switching layouts preserves the first three emblem states, selected teams, expected series, roll tokens, and current three offered actions. New fourth/fifth slots use deterministic legal defaults, and **Reset Board** resets within the selected layout.

Recommendation search runs in a Web Worker so the page remains responsive during heavier five-emblem calculations. Editing the board, menu, tokens, objective, or layout invalidates the displayed recommendation; active stale work is cancelled and cannot replace a newer result.

The worker also has a bounded lifetime so caches from many hypothetical boards cannot accumulate indefinitely across a long browser session. Two-spend target-probability requests retire their worker after returning the result, and other workloads periodically recycle the worker after eight successful requests. This changes cache lifetime, not recommendation semantics.

## Data and generated files

Canonical model inputs live under `data/`:

- `ti2026-statistical-model.json` — team/role quantile distributions, effective sample support, and cross-stat correlations;
- `ti2026-title-model.json` — title-prefix expected boosts by team and role plus title catalog metadata.

`src/data/` contains application code/configuration such as rosters, legal operations, default state, and validated model loaders. `build/` and `docs/` are generated artifacts; do not hand-edit generated JavaScript. See `BUILD_AND_SOURCE_POLICY.md`.

## Local development

Node 22 is the authoritative release/benchmark runtime.

```bash
npm install
npm run typecheck
npm test
npm run verify:generated
```

Run the general performance suite with `npm run benchmark`. Run the v1.0 route baseline with `npm run benchmark:m7b` on Node 22.

## Technical references

- `ENGINEERING.md` — public engineering progression, reference-model definition, alternatives considered, evidence, and remaining limitations.
- `CLIENT_RULES_2026.md` — Fantasy scoring rules and optimizer probability assumptions.
- `engineering/history/M7B_V1_READINESS_AUDIT.md` — detailed v1.0 support/routing and release-readiness evidence.
- `PERFORMANCE.md` — simulation counts and benchmark history.
- `PRODUCT_DECISIONS.md` — product/modeling choices that affect the interface.
- `BUILD_AND_SOURCE_POLICY.md` — canonical source and generated-artifact policy.
