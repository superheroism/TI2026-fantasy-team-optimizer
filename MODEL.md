# Statistical model

This document describes the statistical inputs the optimizer actually uses. It separates those inputs from the upstream process that created them.

## What the optimizer receives

The optimizer starts from precomputed fantasy-point distributions for each team, role, and eligible stat. Each distribution is stored as quantiles rather than a single average, so the simulation can represent both typical and unusual outcomes.

The model also includes an effective-games value for each team, role, and stat. This records how much source data supported that distribution.

## How stats are simulated together

Stats within a role are not simulated independently.

Each role has a Spearman rank-correlation matrix. The scoring engine converts those correlations to a latent Gaussian correlation matrix and uses a Gaussian copula to generate correlated percentile draws. Those draws are then mapped through the stored quantile distributions.

This preserves estimated cross-stat relationships, such as the tendency for some high-GPM games to coincide with high creep score or teamfight participation, without assuming a normal distribution for the fantasy points themselves.

## How fantasy scores are simulated

For each simulated game, the engine:

1. generates correlated percentile draws for the role's modeled stats;
2. maps those percentiles to fantasy-point values using the stored quantiles;
3. applies the selected emblem stats, quality tiers, and trait effects;
4. scores each game under the current Fantasy rules;
5. keeps the required games and series.

The current scoring model keeps the best two games from one retained series. A third game is modeled probabilistically.

The same simulated scenarios are reused when competing boards are compared. A reroll changes how a scenario scores rather than generating an unrelated tournament for each candidate board. This improves comparison stability and reduces repeated work.

## Statistical datasets

The application includes separate precomputed datasets for the Group Stage and Main Event. The Main Event dataset updates the available distributions and limits selectable teams to the active tournament field.

These datasets are model inputs. The optimizer does not fit them in the browser.

## What this repository does not reproduce

The repository contains the outputs of the predictive model, not its training pipeline.

It does not currently reproduce or validate the upstream procedures used to create those distributions, including historical weighting, game-length adjustments, calibration metrics, or comparisons with simpler forecasting baselines.

Those methods should be treated as model provenance unless the generating pipeline and validation evidence are also preserved in the repository.

## Relationship to the optimizer

The statistical model estimates possible team and role outcomes. The optimizer is a separate decision layer: it applies board mechanics, simulates fantasy scoring, compares legal actions, re-optimizes team and title choices, and searches over the remaining token horizon.

See `ENGINEERING.md` for search and simulation architecture, `CLIENT_RULES_2026.md` for game mechanics and probability assumptions, and `PERFORMANCE.md` for the current computational contract.
