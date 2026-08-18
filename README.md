# Dota 2 Fantasy Optimizer 2026

A browser tool for matching or importing a TI 2026 Fantasy board, comparing teams, and choosing how to spend your next reroll token.

The optimizer models a range of possible Fantasy outcomes instead of ranking players by averages alone. It supports both 3-emblem and 5-emblem boards.

## Use the optimizer

1. Import a screenshot or enter your Core, Mid, and Support banners.
2. Choose a tournament dataset.
3. Select a team for each role.
4. Enter your remaining tokens and the three actions offered in-game.
5. Choose **Expected final score** or **P(score ≥ target)**.
6. Run the optimizer.
7. Apply the recommendation in-game, then update the board and available actions.

New boards provide a recommended starting point for each layout. Every emblem starts at Tier III with strong legal stats from the selected tournament dataset. The optimizer then selects a strong team and compatible traits for each banner. Use these defaults as a quick guide; replace them with your actual board before optimizing.

Core uses positions 1 and 3, Mid uses position 2, and Support uses positions 4 and 5. Enter each emblem's stat, quality tier, and trait. The tool calculates the banner multiplier.

## How optimization works

The optimizer starts with precomputed fantasy-point distributions for each team and role. It simulates related stat outcomes, applies Dota Fantasy's best-game and best-series scoring rules, and compares every legal target for the three available reroll actions. After each possible result, it can also choose a better team or title at no token cost.

It also compares rerolling the action menu with keeping the current board.

With one token left, the optimizer can model one spend. With two or more tokens, it looks ahead at most two spends. The 3-emblem layout uses the full production search at this horizon. The 5-emblem layout uses a validated adaptive search that spends more computation on close decisions and uses the full search when needed.

The optimizer reuses the same simulated tournament scenarios when it compares boards. This reduces random simulation differences between competing actions.

See `reference/MODEL.md` for more about the statistical inputs, correlations, simulation method, and model provenance.

## Probability assumptions

Valve does not publish every reroll probability. The optimizer therefore uses explicit assumptions for unknown probabilities, including replacement stats, qualities, traits, random targets, and future action menus.

These are model inputs, not claims about hidden client behavior. See `reference/CLIENT_RULES_2026.md` for the current rules and assumptions.

## Limitations

The model includes role-specific performance distributions, correlations between stats on a banner, quality and trait effects, retained-game scoring, legal rerolls, and free team selection.

It does not yet model exact game-level relationships between paired Core or Support players, opponent effects, game duration, or one shared tournament-advancement path across all selected roles. Search beyond two token spends remains research-only.

P10 and P90 describe modeled ranges, not guarantees. Recommendation confidence describes how stable a decision is within the model, not certainty about future matches.

## Screenshot import

Screenshot import reads the board, teams, reroll actions, and token count when they are visible. It flags uncertain fields for review instead of accepting them silently.

Chromium is the certified browser for screenshot import in v1.2. Firefox screenshot import is not certified. This does not affect manual board entry or optimizer behavior.

## Data and source files

Model inputs are in `data/`. Application source is in `src/`. Static web source is in `site/`.

`build/` and `docs/` are generated. `docs/` is the GitHub Pages deployment tree, not the documentation source. Do not edit generated JavaScript by hand.

See `reference/BUILD_AND_SOURCE_POLICY.md` for details.

## Local development

Use Node 22 for release and benchmark work.

```bash
npm install
npm run typecheck
npm test
npm run verify:generated
```

Run `npm run benchmark` for the general performance suite. Run `npm run benchmark:v1` for the production release check.

## Reference documentation

For setup and normal use, start here. Use `reference/` when you need more detail:

- `reference/MODEL.md` — statistical inputs and simulation method.
- `reference/CLIENT_RULES_2026.md` — game rules and probability assumptions.
- `reference/PRODUCT_DECISIONS.md` — product and modeling choices.
- `reference/ENGINEERING.md` — current architecture and search design.
- `reference/PERFORMANCE.md` — performance requirements and production baseline.
- `reference/SCREENSHOT_IMPORT_PIPELINE.md` — screenshot-import behavior and verification.
- `reference/UI_APPLICATION_ARCHITECTURE.md` — browser modules and worker boundaries.
- `reference/BUILD_AND_SOURCE_POLICY.md` — editable sources and generated output.
- `reference/ENGINEERING_ROADMAP.md` — longer-term engineering direction.
- `reference/RELEASE_NOTES_1.2.0.md` — v1.2 release notes.
- `reference/RELEASE_NOTES_1.1.0.md` — v1.1 release notes.
- `engineering/history/` — archived milestone records for deeper engineering research.
