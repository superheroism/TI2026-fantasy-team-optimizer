# Dota 2 Fantasy Optimizer 2026

A browser tool for building or importing a TI 2026 Fantasy board, comparing teams, and choosing how to spend the next reroll token.

The optimizer models a range of plausible Fantasy outcomes instead of ranking players by average stats alone. It supports both 3-emblem and 5-emblem boards.

## Use the optimizer

1. Import a screenshot or enter the Core, Mid, and Support banners manually.
2. Choose the statistical dataset you want to use.
3. Select a team for each role.
4. Enter your remaining tokens and the three actions offered in-game.
5. Choose an objective: **Expected final score** or **P(score ≥ target)**.
6. Run the optimizer.
7. Apply the recommendation in-game, then update the board and menu.

Fresh boards also provide a model-backed starting point for each layout: Tier III emblems, legal high-value stats, a team selected for the completed banner, and a strong compatible trait setup. These defaults are a quick recommendation guide, not a substitute for matching your actual in-game board.

Core uses positions 1 and 3, Mid uses position 2, and Support uses positions 4 and 5. For each emblem, enter its stat, quality tier, and trait. The tool calculates the resulting banner multiplier.

## What the model does

The optimizer starts from precomputed team- and role-level fantasy-point distributions. It simulates correlated stat outcomes, applies Dota Fantasy's best-game and best-series retention rules, and compares every legal target for the three visible reroll actions. Free team and title choices are re-optimized after each possible result.

It also considers rerolling the action menu and keeping the current board.

The production search looks ahead at most two token spends. Three-emblem search uses the full production reference search at this horizon. Five-emblem, two-spend search uses a validated adaptive policy that spends more computation on close decisions and falls back to full reference search when needed.

When comparing hypothetical boards, the optimizer reuses the same simulated tournament scenarios. This reduces simulation noise between competing actions.

See `reference/MODEL.md` for the statistical inputs, correlation model, simulation boundary, and model provenance.

## Probability assumptions

Valve does not publish every reroll probability. The optimizer therefore makes explicit assumptions for unknown probabilities, including replacement stats, qualities, traits, random targets, and future action menus.

These assumptions are model inputs, not claims about hidden client RNG. See `reference/CLIENT_RULES_2026.md` for the current rules and assumptions.

## Limitations

The model includes role-specific performance distributions, within-banner stat correlation, quality and trait effects, retained-game scoring, legal rerolls, and free team re-optimization.

It does not yet model exact game-level covariance between paired Core or Support players, opponent effects, game duration, or one shared tournament-advancement path across all selected roles. Search beyond two spends remains research-only.

P10 and P90 values are modeled ranges, not guarantees. Recommendation confidence describes decision stability within the model, not certainty about future Dota matches.

## Screenshot import

Screenshot import reads the board, teams, reroll actions, and token count when they are visible. Uncertain fields are highlighted for review instead of being silently accepted.

Chromium is the certified screenshot-import browser for v1.2. Firefox screenshot import is not certified in this release. Manual board entry and optimizer behavior are not affected by that limitation.

## Data and source files

Canonical model inputs live in `data/`. Application source lives in `src/`. Static source files used for the web application live in `site/`.

`build/` and `docs/` are generated. `docs/` is the current GitHub Pages deployment tree; despite its name, it is not the documentation source. Do not hand-edit generated JavaScript.

See `reference/BUILD_AND_SOURCE_POLICY.md` for the source-of-truth policy.

## Local development

Node 22 is the release and benchmark runtime.

```bash
npm install
npm run typecheck
npm test
npm run verify:generated
```

Run `npm run benchmark` for the general performance suite and `npm run benchmark:v1` for the production-route release check.

## Reference documentation

Current documentation is grouped under `reference/`:

- `reference/MODEL.md` — statistical inputs and simulation method.
- `reference/CLIENT_RULES_2026.md` — game rules and probability assumptions.
- `reference/PRODUCT_DECISIONS.md` — product and modeling choices.
- `reference/ENGINEERING.md` — current architecture and search design.
- `reference/PERFORMANCE.md` — performance contract and production baseline.
- `reference/SCREENSHOT_IMPORT_PIPELINE.md` — screenshot-import behavior and verification.
- `reference/UI_APPLICATION_ARCHITECTURE.md` — browser module and worker boundaries.
- `reference/BUILD_AND_SOURCE_POLICY.md` — editable sources and generated output.
- `reference/ENGINEERING_ROADMAP.md` — longer-term engineering direction.
- `reference/RELEASE_NOTES_1.2.0.md` — v1.2 release notes.
- `reference/RELEASE_NOTES_1.1.0.md` — v1.1 release notes.
- `engineering/history/` — archived milestone records for deeper engineering research.
