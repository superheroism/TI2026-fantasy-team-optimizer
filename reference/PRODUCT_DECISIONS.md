# Product and modeling decisions

This document records current choices that affect product behavior or how results should be interpreted. Detailed game rules live in `CLIENT_RULES_2026.md`.

## Board entry supports manual and screenshot input

Users can enter the board with selectors or import a screenshot. Screenshot import highlights uncertain fields for review instead of silently accepting weak reads.

## Teams are the roster controls

A team is selected independently for each role:

- Core — positions 1 and 3.
- Mid — position 2.
- Support — positions 4 and 5.

Player names provide context but are not separate roster controls.

## Dataset choice changes model inputs

The product exposes **Pre-TI2026-Correlations** and **GroupStage-Correlations**. Both use the same scoring formulas, retained-game simulation, search policy, and result UI.

Changing the dataset changes statistical inputs. It does not select a different optimizer implementation.

## Eligibility is separate from model history

Historical observations can remain in a statistical dataset after a team is no longer eligible for selection. The production roster filter controls current eligibility independently of the statistical history.

## Layouts have different Expected Series defaults

The 3-emblem layout defaults Expected Series to 5. The 5-emblem layout defaults it to 3.

These are starting values, not hard rules. After a user manually changes a role's value, later layout changes preserve that explicit choice. Resetting the board restores automatic defaults.

## Emblem multipliers are derived

Users edit Stat, Tier, and Trait. The tool calculates the effective multiplier from the full banner so trait and adjacency effects remain consistent with scoring.

## Scoring uses distributions

The model uses team and role performance distributions and within-banner stat correlation, then applies Fantasy's retained-game rules.

It remains a proxy. Exact pair-level game covariance, opponent effects, game duration, and shared tournament advancement are not yet modeled.

## Search compares the full current decision set

For each visible reroll action, the optimizer checks every legal target and then re-optimizes free team and title choices. It also considers rerolling the action menu and keeping the current board.

The objective is either expected final score or probability of reaching a chosen target.

## Unknown probabilities stay explicit

When client probabilities are unpublished, the optimizer uses the assumptions in `CLIENT_RULES_2026.md`. These assumptions are model inputs, not claims about hidden client RNG.

## Production lookahead is capped at two spends

The browser models at most two token spends. The visible action uses the full adopted transition distribution. Deeper hypothetical continuation uses a validated lower-cost representation.

This limits runtime without changing the legal actions available now or their immediate outcome probabilities.

## Presentation and search use different simulation budgets

The selected-board distribution uses more Monte Carlo samples to produce a stable presentation. Search uses fewer shared scenarios and cached work because its job is to rank decisions quickly.

See `PERFORMANCE.md` for current budgets and measured runtimes.

## Action-card ranges are deltas

P10, Median, Expected, and P90 on an Available Action card are changes relative to keeping the best current setup after modeled continuation. They are not the same values as the absolute tournament-score distribution.

## Team comparisons depend on the banner

The Likely Results view compares teams under the current banner mechanics. Changing only the selected team can reuse those mechanics. Changing a stat, tier, trait, Expected Series value, layout, or statistical dataset requires a new evaluation.

## Confidence means decision stability

Confidence describes how stable the recommendation is within the current model. It is not a forecast-confidence statement about future Dota matches.

## Titles

Title prefixes use modeled role boosts. The suffix is not assigned an invented expected value when its trigger value is unavailable.

## Visual hierarchy

Red, green, and blue are reserved for emblem and stat-pool meaning. Gold marks recommended or best outcomes. Purple is used for interaction and application structure.