# Dota 2 Fantasy Optimizer 2026

A browser tool for building a TI 2026 Fantasy board, comparing teams, and deciding how to spend the next reroll token.

Unlike a simple average-stat ranking, the optimizer models a distribution of plausible Fantasy outcomes and the game's best-game retention rules.

## What v1.0 supports

The tool supports both **3 Emblems** (`legacy_3`) and **5 Emblems** (`expanded_5`) and two objectives:

- **Expected final score** — maximize the average modeled final score.
- **P(score ≥ target)** — maximize the chance of clearing a chosen score.

Recommendation search looks ahead at most **two token spends**.

| Layout | 0 tokens | 1 spend | 2 spends |
|---|---|---|---|
| 3 Emblems | score current board | full reference search | full reference search |
| 5 Emblems | score current board | full reference search | validated adaptive search, with full-search fallback |

Here, **reference search** means the complete search defined by the production model. The model itself still contains explicit assumptions where Valve does not publish probabilities. It is not a claim that the tool enumerates every possible tournament future.

For the five-emblem, two-spend route, the adaptive policy does less work when one action is clearly ahead and spends more computation on close decisions. On its preregistered 12-case holdout it matched full reference search in all 12 cases, with zero measured regret; 16.7% of cases required full-search fallback. This is validation on the frozen test set, not a proof of equivalence for every possible board.

## How to use it

1. Choose **3 Emblems** or **5 Emblems** and enter the Core, Mid, and Support banners.
2. Select a team for each role.
3. Enter your remaining tokens and the three actions currently offered in-game.
4. Choose **Expected final score** or **P(score ≥ target)**.
5. Run the optimizer.
6. Apply the recommendation in-game, then update the board and menu.

Core uses positions 1 + 3, Mid uses position 2, and Support uses positions 4 + 5. Core and Support player scores are averaged within the role.

For each emblem, enter its **stat**, **quality tier**, and **trait**. The tool derives the effective multiplier from the full banner, including trait interactions.

## How scoring works

The statistical model contains team- and role-level stat distributions plus correlations among stats on the same banner. Correlation matters because Fantasy rewards strong games, not just high averages.

For each role:

```text
score each game
→ keep the best 2 games in a series
→ keep the best series in the scoring period
```

The final score is:

```text
Core + Mid + Support retained scores
```

Monte Carlo simulation estimates the selected board's expected score, median, P10, P90, and target probability when applicable. **P10/P90 are modeled ranges, not guarantees.**

When comparing hypothetical boards, the optimizer reuses the same simulated underlying performances. This is a common-random-numbers design: competing actions are compared against the same modeled tournament worlds instead of unrelated random draws.

## What the optimizer compares

For each visible reroll action, the optimizer checks every legal Core, Mid, and Support target. For every possible result it recalculates banner effects, re-optimizes the free team selections, and scores the resulting board.

It also considers **rerolling the action menu** and **keeping the current board**. A menu reroll costs one token but does not change the board.

The action available now uses its full modeled transition distribution. Deeper hypothetical decisions use a smaller deterministic set of representative outcomes to keep the search tractable and reproducible. `ENGINEERING.md` explains this approximation and how it was validated.

## Probability assumptions

Valve does not publish every reroll probability used by the optimizer. The current model assumes:

- legal replacement stats are equally likely after must-change and no-duplicate rules;
- the other four quality tiers are equally likely on a quality reroll;
- the other four traits are equally likely on a trait reroll;
- valid higher/lower quality destinations are equally likely for directional changes;
- random quality operations choose eligible slots equally;
- a future menu is a uniform draw of 3 distinct actions from the 20-action catalogue.

These are model inputs, not claims about hidden client RNG. See `CLIENT_RULES_2026.md`.

## Current limitations

v1.0 models role-specific stat distributions, within-banner stat correlation, quality and trait effects, retained-game scoring, legal rerolls, free team re-optimization, and a two-spend decision horizon.

It does not yet model exact game-level covariance between the two Core/Support players, opponent effects, game-duration effects, or one shared tournament-advancement path across selected roles. Search beyond two spends remains research-only. Title prefixes use modeled role boosts; the suffix is not given an invented expected value.

## Board layouts and browser behavior

**3 Emblems** is the backward-compatible default. Switching to **5 Emblems** preserves the first three emblem states, selected teams, expected series, tokens, and current menu; new slots receive deterministic legal defaults.

Recommendation search runs in a Web Worker so heavier calculations do not freeze the page. Editing optimizer-relevant state cancels or invalidates stale work. Workers are also recycled periodically to bound long-session cache growth; this changes cache lifetime, not recommendation logic.

## Data and generated files

Canonical model inputs live in `data/`:

- `ti2026-statistical-model.json` — team/role distributions, sample support, and cross-stat correlations.
- `ti2026-title-model.json` — modeled title-prefix boosts and title metadata.

`src/data/` contains application configuration and validated model loaders. `build/` and `docs/` are generated; do not hand-edit generated JavaScript. See `BUILD_AND_SOURCE_POLICY.md`.

## Local development

Node 22 is the release and benchmark runtime.

```bash
npm install
npm run typecheck
npm test
npm run verify:generated
```

Run `npm run benchmark` for the general performance suite and `npm run benchmark:m7b` for the v1.0 production-route baseline.

## Technical references

- `ENGINEERING.md` — how the architecture and production search policy were developed and validated.
- `CLIENT_RULES_2026.md` — game rules and explicit probability assumptions.
- `PERFORMANCE.md` — current performance contract and benchmark summary.
- `PRODUCT_DECISIONS.md` — product/model choices that affect interpretation.
- `UI_APPLICATION_ARCHITECTURE.md` — browser module and worker boundaries.
- `BUILD_AND_SOURCE_POLICY.md` — source-of-truth and generated-file policy.
- `engineering/history/` — detailed milestone records and raw engineering rationale.