# Product and Modeling Decisions

This file records the choices that materially affect how the optimizer behaves or how its results should be interpreted.

## Board entry uses selectors

The public tool uses explicit controls rather than screenshot parsing. The user directly enters the state the optimizer needs, which avoids adding recognition error to the decision model.

## Team is the selectable roster unit

The interface selects one team independently for each role:

- Core → position 1 + position 3
- Mid → position 2
- Support → position 4 + position 5

Player names are shown as context beneath the team selection. They are not independent roster controls.

## Emblem multipliers are derived

The user edits Stat, Tier, and Trait. Effective multipliers are calculated from the complete banner so adjacency and activation effects cannot drift out of sync with the scoring model.

## The model is distribution-aware

The scoring model uses team- and role-level distributions plus cross-stat correlation rather than simple average-stat scoring. It also applies the best-two-games / best-series retention rule.

This is still a proxy. Exact player-game covariance, opponent effects, game duration, and shared tournament advancement are outside the current model.

## The optimizer evaluates the whole decision

A visible reroll is not evaluated only on the banner currently selected in the UI. The optimizer compares every legal action × banner combination, then re-optimizes the free team choices and title contribution.

Menu reroll and keeping the best current setup are part of the same decision set.

The objective is either:

- expected final score; or
- probability of reaching the user's target score.

## Reroll probabilities are explicit assumptions

Where exact reroll probabilities are not specified, the optimizer uses the uniform transition assumptions documented in `CLIENT_RULES_2026.md`.

Keeping these assumptions explicit is preferable to hiding them inside the search code. They can be replaced later without changing the UI or scoring rules.

## Browser lookahead is finite

The current browser search looks ahead at most two token spends. Immediate visible-action transitions are evaluated completely under the adopted transition model; approximation is introduced in the expensive continuation calculation.

This keeps the first decision accurate to the current model while bounding runtime.

## Score simulation and action search use different budgets

The selected-board histogram uses a larger Monte Carlo sample because it is a presentation-quality distribution. Reroll search uses a lower-cost common-random-number model and cached role frontiers so the recommendation remains interactive.

The performance configuration and benchmark are documented in `PERFORMANCE.md`.

## Action ranges are relative to keeping the board

P10, Median, Expected, and P90 on an Available Action card are **deltas versus the best current setup** after the modeled continuation policy. They are not the same quantities as the tournament-score histogram.

The zero line is the keep-current-board reference.

## Team comparisons are banner-dependent

The Likely Results view compares every available team under the current banner mechanics. Changing the selected team alone does not change those simulated banner mechanics; changing a stat, tier, trait, or expected-series assumption does.

## Confidence is about decision robustness

Confidence describes how stable the recommended action is within the current probability and score model. It should not be read as confidence that future Dota matches themselves will follow the simulated distribution.

## Titles

Title-prefix contribution is optimized from the modeled role boosts available to the tool. The suffix is not assigned an invented numeric expected value when its trigger value is not modeled.

## Visual hierarchy

RED, GREEN, and BLUE remain reserved for emblem/stat-pool meaning. Gold marks recommended/best outcomes. Purple is used for interaction and application structure.

The visual system should support the decision rather than add another layer of interpretation.
