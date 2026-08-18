# Statistical model

This document explains the statistical inputs used by the optimizer. It also identifies which parts of the upstream modeling process are not stored in this repository.

## Model inputs

The optimizer starts with precomputed fantasy-point distributions for each team, role, and eligible stat. Each distribution is stored as quantiles instead of a single average. This lets the simulation represent both typical and unusual outcomes.

Each team, role, and stat also has an effective-games value that indicates how much source data supported its distribution.

## Correlations between stats

Stats within a role are not simulated independently.

Each role has a Spearman rank-correlation matrix. The scoring engine converts it to the correlation form required by a Gaussian copula. The copula generates related percentile draws, which are then mapped through the stored quantile distributions.

In practical terms, this lets the simulation preserve estimated relationships between stats. For example, high GPM can occur alongside high creep score more often than independent sampling would imply. Fantasy points themselves do not have to follow a normal distribution.

## Fantasy-score simulation

For each simulated game, the engine:

1. generates related percentile draws for the role's stats;
2. converts those percentiles to fantasy-point values using the stored quantiles;
3. applies emblem stats, quality tiers, and traits;
4. scores the game under the current Fantasy rules;
5. keeps the games and series required by those rules.

The current scoring model keeps the best two games from one retained series. A third game occurs with a modeled probability.

When the optimizer compares boards, it reuses the same simulated tournament scenarios. A reroll changes how each scenario scores instead of generating a separate tournament for every candidate. This makes comparisons more stable and avoids repeated work.

## Tournament datasets

The application includes separate precomputed datasets for the Group Stage and Main Event. The Main Event dataset updates the statistical distributions and limits team selection to the active tournament field.

These datasets are inputs. The browser does not fit the underlying predictive model.

## What this repository does not include

This repository contains the outputs of the predictive model, not the training pipeline that produced them.

It therefore does not reproduce or validate the upstream methods used to create the distributions, including historical weighting, game-length adjustments, calibration measures, or comparisons with simpler forecasting methods.

Treat those methods as model provenance unless the training pipeline and its validation evidence are also preserved here.

## Model versus optimizer

The statistical model describes possible team and role outcomes. The optimizer is the decision layer. It applies board rules, simulates Fantasy scoring, compares legal actions, selects teams and titles, and searches across the remaining token horizon.

See `ENGINEERING.md` for the search architecture, `CLIENT_RULES_2026.md` for game rules and probability assumptions, and `PERFORMANCE.md` for current performance requirements.
