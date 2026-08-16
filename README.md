# Dota 2 Fantasy Optimizer 2026

A browser-based tool for building a TI 2026 Fantasy board, comparing team choices, and deciding how to spend the next reroll token.

The optimizer is distribution-aware: it models a range of plausible outcomes rather than ranking boards from simple averages alone.

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

The simulator uses precomputed team- and role-level statistical distributions and models correlations among the three stats on a banner. That matters because Fantasy keeps strong games rather than averaging every game equally.

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

The selected setup is evaluated with Monte Carlo simulation. The tool reports:

- expected score;
- median score;
- P10 and P90;
- probability of reaching the selected target, when a target is set.

P10 and P90 are useful as a compact downside/upside range. They are not guarantees.

## What the optimizer compares

For each visible reroll action, the optimizer evaluates every legal Core, Mid, and Support target. For each possible result it recalculates the banner, re-optimizes the free team selections, and estimates the resulting board value.

The decision set always includes:

```text
three visible actions × legal banners
+ menu reroll
+ best current setup
```

A menu reroll costs one token and preserves the board. The optimizer therefore does not force a board change when the visible actions are worse than keeping the current setup.

When tokens remain, the search also values the option to make another decision afterward. Browser lookahead is currently capped at **two token spends** for runtime control.

## Reroll model assumptions

Some reroll probabilities are not treated as known client odds. The current model assumes:

- a stat reroll is uniform over legal replacement stats, after enforcing must-change and no-duplicate rules;
- an ordinary quality reroll is uniform over the other four tiers;
- a trait reroll is uniform over the other four traits;
- a directional quality change is uniform over valid tiers above or below the current tier;
- random quality operations choose eligible slots uniformly;
- a future action menu is a uniform draw of 3 distinct actions from the 20-action catalogue.

These are modeling assumptions. If better transition information becomes available, the probability model can be replaced without changing the board interface.

## Reading the results

### Available Actions

Each action card shows the best legal target by default. The action plot is expressed as **change versus keeping the best current setup**:

- **Expected** — average modeled value after the reroll and continuation policy;
- **Median** — middle modeled outcome;
- **P10 / P90** — lower and upper outcome markers;
- **0** — no change versus keeping the current setup.

This action distribution is different from the full Fantasy-score distribution below it.

### Selected Setup

The histogram shows the modeled final-score distribution for the currently selected board and roster. It is the right view for questions like “how volatile is this setup?” or “how often does it clear my target?”

### Likely Results

Core, Mid, and Support team comparisons use the current banner mechanics and rank every available team for that role. Changing the banner can therefore change the best team.

### Confidence

Confidence describes how robust the recommended action is within the current model. It does not remove uncertainty in future match performance.

## Current scope

The current release is a **distribution-aware proxy**, not a complete tournament simulator.

It currently models:

- team- and role-specific stat distributions;
- cross-stat correlation within a banner;
- quality and trait effects across the full War Banner;
- best-two-games and best-series retention;
- legal reroll outcomes;
- free team re-optimization after hypothetical board changes;
- a two-token decision horizon in the browser.

It does not yet model exact player-game covariance for Core/Support pairs, opponent-specific effects, game-duration effects, or a shared tournament-advancement path across selected roles.

Title prefixes are optimized from the modeled role boosts available to the tool. The suffix is not assigned a fabricated numeric expected value.

## Data layout

Model inputs live under `data/`:

- `ti2026-statistical-model.json` — team/role quantile distributions, effective sample support, and cross-stat correlations.
- `ti2026-title-model.json` — title-prefix expected boosts by team and role, plus title catalog metadata.

`src/data/` contains application code and configuration such as rosters, legal operations, default state, and model loaders. Fitted/model values live in root `data/`. The build copies those model files unchanged into `docs/data/` for GitHub Pages.

## Technical references

- `CLIENT_RULES_2026.md` — Fantasy scoring rules and optimizer probability assumptions.
- `PERFORMANCE.md` — simulation counts, runtime approximations, and benchmarks.
- `PRODUCT_DECISIONS.md` — product and modeling choices that affect the interface.

## Board layouts

The Current Board selector supports both TI 2026 banner geometries. **3 Emblems** is the backward-compatible default; **5 Emblems** uses the expanded five-slot board. Switching layouts preserves the first three emblem states, selected teams, expected series, roll tokens, and the current three offered actions. New fourth/fifth slots use deterministic legal defaults, and **Reset Board** resets within the layout you currently selected.

Recommendation search runs in a Web Worker so the page remains responsive during heavier five-emblem calculations. Editing the board or switching layouts cancels any pending recommendation and prevents stale results from being displayed.
