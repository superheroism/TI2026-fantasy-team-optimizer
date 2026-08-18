# Product and Modeling Decisions

This file records choices that affect product behavior or how results should be interpreted. Detailed game rules live in `CLIENT_RULES_2026.md`; engineering history lives in `engineering/history/`.

## Board entry is explicit

The public tool uses selectors instead of screenshot parsing. Users enter the board state directly, avoiding an extra source of recognition error.

## Teams are the roster controls

A team is selected independently for each role:

- Core → positions 1 + 3
- Mid → position 2
- Support → positions 4 + 5

Player names are shown for context but are not separate controls.

## Statistical dataset choice is a model-loading concern

The product exposes exactly two distribution/correlation datasets: **Pre-TI2026-Correlations** and **GroupStage-Correlations**. Both use the same model adapter, retained-game simulation, scoring formulas, search policy, and result UI. There is no means-only scoring path.

Dataset identity travels through the worker boundary and separates model-dependent caches. Changing the Data Source changes inputs to the optimizer; it does not select a different optimizer implementation.

## Main Event eligibility is separate from historical observations

Historical statistical observations are not treated as roster eligibility. The production roster filter contains the current Main Event field independently of the statistical datasets, so selecting the pre-TI model cannot make an eliminated team selectable. When a source dataset contains historical profiles for eliminated teams, those profiles remain available as model history rather than being deleted from the dataset.

## Expected Series follows layout defaults until explicitly overridden

The 3-emblem layout defaults Expected Series to **5** and the 5-emblem layout defaults it to **3**. Those values are conveniences, not hard bindings. After a user manually edits a role's Expected Series value, later layout changes preserve that explicit value for that role. Resetting the board restores automatic defaults.

## Emblem multipliers are derived

Users edit Stat, Tier, and Trait. The tool calculates effective multipliers from the full banner so adjacency and trait activation stay consistent with scoring.

## Scoring uses distributions, not only averages

The model uses team/role stat distributions and within-banner stat correlation, then applies the best-two-games / best-series retention rule.

It is still a proxy: exact pair-level game covariance, opponent effects, game duration, and shared tournament advancement are not yet modeled.

## The optimizer compares the full decision set

For each visible reroll, the optimizer checks every legal action × banner combination and then re-optimizes free team and title choices. It also considers menu reroll and keeping the current board.

The objective is either expected final score or probability of reaching a chosen target.

## Unknown reroll odds stay explicit

When client probabilities are unpublished, the optimizer uses the assumptions in `CLIENT_RULES_2026.md`. Keeping these assumptions outside search logic makes them visible and replaceable.

## Production lookahead is capped at two spends

The browser models at most two token spends. The action available now uses the full adopted transition model; deeper hypothetical continuation uses a validated lower-cost representation.

This bounds runtime without changing the legal root actions or their immediate outcome probabilities.

## Presentation and search use different simulation budgets

The selected-board histogram uses more Monte Carlo samples because it is meant to show a smooth score distribution. Action search uses fewer shared scenarios and cached role work because its job is to rank decisions quickly.

See `PERFORMANCE.md` for the current budgets and measured runtimes.

## Action-card ranges are deltas

P10, Median, Expected, and P90 on an Available Action card are **changes relative to keeping the best current setup** after modeled continuation. They are not the same values as the absolute tournament-score histogram.

## Team comparisons depend on the banner

The Likely Results view compares teams under the current banner mechanics. Changing only the selected team can reuse those mechanics; changing a stat, tier, trait, expected-series assumption, or statistical dataset requires a new evaluation.

## Confidence means decision stability

Confidence describes how robust the recommendation is **within the current model**. It is not a forecast-confidence statement about future Dota matches themselves.

## Titles

Title prefixes use modeled role boosts. The suffix is not assigned an invented expected value when its trigger value is unavailable.

## Visual hierarchy

RED, GREEN, and BLUE are reserved for emblem/stat-pool meaning. Gold marks recommended or best outcomes; purple is used for interaction and application structure.
