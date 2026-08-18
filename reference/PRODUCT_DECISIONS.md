# Product and modeling decisions

This document records current product choices and explains how to interpret the results. See `CLIENT_RULES_2026.md` for detailed game rules.

## Enter a board manually or from a screenshot

Users can enter a board with selectors or import a screenshot. Screenshot import flags uncertain fields for review instead of accepting weak reads silently.

## Select teams by role

Choose one team for each role:

- Core — positions 1 and 3.
- Mid — position 2.
- Support — positions 4 and 5.

Player names provide context but are not separate controls.

## Dataset selection changes statistical inputs

The available tournament datasets use the same scoring rules, retained-game simulation, search policy, and results UI.

Changing the dataset changes the statistical inputs. It does not switch to a different optimizer.

## Team eligibility is separate from model history

A statistical dataset can contain historical results for a team that is no longer eligible for selection. The roster filter controls current eligibility separately from model history.

## Layouts have different Expected Series defaults

The 3-emblem layout starts at 5 expected series. The 5-emblem layout starts at 3.

These are defaults, not rules. If a user changes a role's value, switching layouts preserves that choice. Resetting the board restores the defaults.

## The tool calculates emblem multipliers

Users enter Stat, Tier, and Trait. The tool calculates the effective banner multiplier so trait and adjacency effects stay consistent with scoring.

## Scoring uses distributions

The model uses team and role performance distributions and correlations between stats on each banner. It then applies the Fantasy retained-game rules.

The model is still an approximation. It does not yet include exact game-level relationships between paired Core or Support players, opponent effects, game duration, or one shared tournament-advancement path across all roles.

## Search compares every current option

For each visible reroll action, the optimizer checks every legal target and then selects the best team and title at no token cost. It also compares rerolling the action menu with keeping the current board.

Users can optimize either expected final score or the probability of reaching a chosen target.

## Unknown probabilities are explicit assumptions

When client probabilities are not published, the optimizer uses the assumptions in `CLIENT_RULES_2026.md`. These are model inputs, not claims about hidden client behavior.

## Production search looks ahead at most two spends

The browser models at most two token spends. It models the visible action with the full adopted outcome distribution. For a possible second spend, it uses a validated lower-cost representation.

This keeps runtime manageable without changing the legal actions available now or their immediate probabilities.

## Results and search use different simulation budgets

The selected-board score range uses more Monte Carlo samples for a stable display. Search uses fewer shared scenarios and cached work because it needs to rank decisions quickly.

See `PERFORMANCE.md` for current budgets and measured runtimes.

## Action-card ranges show changes from keeping the board

P10, Median, Expected, and P90 on an Available Action card show score changes relative to keeping the best current board after modeled continuation. They are not absolute tournament scores.

## Team comparisons depend on the banner

Likely Results compares teams using the current banner. Changing only the selected team can reuse the same banner calculation. Changing a stat, tier, trait, Expected Series value, layout, or dataset requires a new evaluation.

## Confidence describes decision stability

Confidence describes how stable a recommendation is within the current model. It does not measure certainty about future Dota matches.

## Titles

Title prefixes use modeled role boosts. The optimizer does not invent an expected value for a suffix when its trigger value is unavailable.

## Visual hierarchy

Red, green, and blue identify emblem and stat-pool meaning. Gold marks recommended or best outcomes. Purple identifies interactions and application structure.
