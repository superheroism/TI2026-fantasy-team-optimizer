# Dota 2 Fantasy Board Optimizer

A browser-based optimizer for the TI 2026 Dota 2 Fantasy board.

The app models the score distribution of the current board, compares eligible player combinations, and evaluates the expected value of the reroll actions currently offered by the client. It is designed to answer two separate questions:

1. **What is the strongest roster for this board?**
2. **Given the current board and available rerolls, what should I do next?**

The optimizer supports expected-score and target-probability objectives. The latter can be useful when the goal is not simply the highest mean score, but maximizing the chance of clearing a specific threshold.

## Use the optimizer

The deployed GitHub Pages application is built from this repository's canonical TypeScript, data, and static-site sources.

## How the model works

At a high level, the optimizer combines four pieces:

- a statistical model of player fantasy production;
- the current nine-emblem board and its quality/trait effects;
- the tournament roster and selected title;
- the probability distributions of legal reroll operations and future menus.

For any candidate board, the scoring engine simulates correlated player performance across teams and roles, applies emblem multipliers and traits, retains the games that count under the Fantasy rules, and evaluates all legal Core, Mid, and Support combinations.

The action optimizer then evaluates the current menu using a finite-horizon value function. Immediate reroll outcomes are enumerated exactly. Future menus use the exact combinatorial best-of-three operator for the normal uniform menu distribution. Search reuses the same underlying player-performance scenarios across competing board states so that a hypothetical quality or trait change does not require regenerating the tournament.

Production currently models at most two token spends. Deeper horizons have been investigated experimentally but are not exposed in the application because their runtime and decision robustness do not yet meet the project's validation standard.

## Repository structure

```text
src/        canonical TypeScript application source
data/       canonical statistical and title models
site/       canonical static HTML/CSS
scripts/    build, validation, and benchmark tooling
tests/      regression and integration tests

build/      generated compiler output
docs/       generated GitHub Pages deployment
benchmarks/ persisted benchmark and validation reports
```

`src/`, `data/`, and `site/` are authoritative. `build/` and `docs/` are generated artifacts and should not be edited directly.

See `BUILD_AND_SOURCE_POLICY.md` for the exact build/source contract.

## Build and test

Requirements:

- Node.js
- npm

Install dependencies:

```bash
npm install
```

Build the application and deployment tree:

```bash
npm run build
```

Run the tests:

```bash
npm test
```

Run the standard benchmark:

```bash
npm run benchmark
```

## Engineering documentation

The repository contains milestone records describing the optimizer's architecture and performance work. `ENGINEERING_ROADMAP.md` is the architecture authority. `PERFORMANCE.md` summarizes benchmark results and major performance conclusions.

The current engine uses compact canonical state IDs, cached transition distributions, reusable stochastic scenario banks, an exact future-menu operator, and a memoized finite-horizon value function. Experimental deeper-search work is documented separately from the production policy so that performance experiments cannot silently alter the deployed optimizer.

## Current production policy

The normal application:

- optimizes either expected final score or `P(final score >= targetScore)`;
- evaluates the visible current menu at full root fidelity;
- considers stop and menu reroll alongside board-changing actions;
- models at most two token spends;
- keeps deeper target-probability search engineering-only.

Generated deployment behavior is regression-tested against the canonical source implementation.
