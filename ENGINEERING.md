# Engineering the TI 2026 Fantasy Optimizer

This document explains how the optimizer reached its v1.0 architecture. It focuses on the decisions: what problem we encountered, what alternatives were available, why we chose one, how we checked it, and what remained unresolved.

The project followed one rule throughout: **make the decision model trustworthy before making it faster, and measure a proposed optimization before adding complexity.**

## What the optimizer actually models

The optimizer does not enumerate every possible future Dota match, player performance, reroll, menu sequence, and roster combination. That would be computationally impractical and, in several places, would imply precision that the available data do not support.

Instead, v1.0 uses a **production reference model**: a fixed mathematical representation of the Fantasy decision problem. The model defines the game mechanics we know, the assumptions we make where the client does not publish probabilities, the statistical representation of player/team performance, and the fidelity used when looking ahead to hypothetical future decisions.

This distinction matters:

> The search can evaluate the production reference model completely without claiming that the reference model exhaustively represents every possible real-world future.

### Rules and probabilities

Known Fantasy rules—legal stat pools, quality tiers, traits, action scopes, token accounting, and scoring—are implemented as mechanics. Where exact client RNG is not known, the model makes explicit probability assumptions rather than presenting them as discovered game probabilities. In v1.0, for example, legal replacement stats, replacement qualities, replacement traits, eligible random slots, and future three-action menus are modeled uniformly within their legal sets. `CLIENT_RULES_2026.md` is the detailed rules/assumptions reference.

### Player-performance model

The statistical model represents team- and role-level stat distributions and within-banner cross-stat correlation. It then applies Fantasy's retained-game/series scoring. The same underlying simulated performance scenarios are reused when comparing hypothetical boards so that a reroll changes how a scenario is scored rather than inventing a different tournament for each action.

Important limitations remain. Core/Support player pairs are not modeled with exact game-aligned player covariance; opponent-specific effects, game-duration effects, and one shared tournament-advancement path across all selected roles are not modeled. Title prefixes use modeled role boosts, while the suffix is not assigned a fabricated expected value.

### Future decisions and continuation fidelity

The least obvious production assumption is how stochastic reroll outcomes are represented during lookahead.

For the action available **now**, the optimizer evaluates the full modeled transition distribution. Carrying every modeled transition outcome through every additional hypothetical decision, however, causes the reachable state tree to grow extremely quickly. The pre-v1 optimizer therefore used deterministic representative outcome strata for continuation, and the later value-function architecture deliberately preserved that behavior rather than silently changing the model.

The alternatives were:

- **Full transition expansion at every future depth.** Highest fidelity to the modeled transition distribution, but rapidly increasing state count and memory use.
- **Randomly sample future outcomes.** Potentially cheaper, but introduces sampling noise into action comparisons.
- **Deterministic representative continuation outcomes.** Reduces the future frontier while keeping comparisons reproducible.

We chose the third approach. Immediate visible-action metrics use the full modeled transition distribution; the first action entering continuation uses the frozen `continuationEntryStrata`; actions reached through future menus use the frozen `continuationOutcomeStrata`.

Later measurements validated why this boundary matters. With the same production fidelity, representative expected-score search at three modeled token spends was roughly 15–18× slower than at two and reached hundreds of thousands of terminal states. Four-spend searches exceeded the experimental 60-second ceiling. Target-probability search exceeded that ceiling at three spends.

### What “reference search” means

Public documentation uses **full production-reference search** (or simply **reference search**) instead of the ambiguous word “exact.”

Reference search means that the optimizer evaluates the complete action/value-function search defined by the frozen production reference model. It does **not** mean that every real-world uncertainty or every stochastic continuation outcome is exhaustively enumerated.

Individual components can still be exact in a narrower mathematical sense. For example, legal transition probabilities are computed directly from the defined mechanics, and the uniform future-menu expectation is evaluated analytically rather than estimated by sampling.

For the five-emblem board at two modeled spends, v1.0 uses **certified adaptive reference search**: it first spends less work on clear decisions, progressively refines close decisions, and falls back to full reference search when its frozen ambiguity rules require it.

## 1. Establish a reproducible baseline

The original browser optimizer worked, but performance work would not be trustworthy without a stable way to detect behavioral changes.

Options:

- **Optimize the existing code immediately.** Fastest to start, but difficult to distinguish speedups from semantic regressions.
- **Rewrite around a cleaner architecture.** Attractive on paper, but discards the working implementation as a reference.
- **Freeze behavior, build regression evidence, then refactor incrementally.** More setup, but every later change has a comparison point.

We chose the third approach. Canonical TypeScript source, deterministic generated artifacts, typechecking, regression tests, CI, seeded stochastic behavior, and representative benchmarks became the development baseline. Objective correctness was also tightened so target-probability mode optimizes the selected probability objective rather than using expected score as an intermediate shortcut.

The resulting engineering loop was:

```text
change implementation
→ regenerate
→ typecheck/test
→ compare recommendations and utilities
→ benchmark
```

## 2. Separate mechanics from search

Rules, stochastic transitions, scoring, menu generation, and search originally had more overlap than we wanted for deeper optimization work.

Options:

- **Keep the integrated implementation.** Minimal refactoring, but search remains coupled to game-specific object manipulation.
- **Design a generic optimizer framework first.** Clean abstraction, but risks solving problems the game does not actually have.
- **Extract boundaries around proven behavior.** Let rules define legality, transitions define next states, scoring value states, and search consume those interfaces.

We chose the third approach. The resulting design principle is simple: search does not implement Dota mechanics, scoring does not implement search, and the UI implements neither.

## 3. Give search a compact, canonical state

Descriptive board objects are useful for humans and the UI, but expensive identities for a search engine. Repeated cloning, serialization, and hashing become significant as the state tree grows.

Options:

- optimize object serialization;
- hash descriptive boards;
- encode the finite game state directly.

We chose direct encoding. An emblem's variable mechanics are `stat × quality × trait`; immutable slot properties such as role, position, and color remain implicit. Banners and boards receive canonical compact IDs, while explicit adapters convert to descriptive `BoardState` objects only at UI/scoring boundaries.

Compact transitions then modify only the affected banner and reuse unchanged role IDs. The old descriptive transition implementation was retained as a reference and compared against the compact implementation across legal stat configurations, quality/trait configurations, probability aggregation, duplicate-stat restrictions, and Tier-I/Tier-V boundaries. The state-encoding suite exhaustively covers more than ten million valid three-emblem banner encodings.

Representative cold optimizer workloads improved by roughly 5–14%, but the larger benefit was architectural: search acquired cheap, collision-tested state identity suitable for memoization.

## 4. Reuse the same simulated worlds across hypothetical boards

A reroll changes how a player's stats score; it does not change the underlying tournament performance that was simulated.

Options:

- **Generate fresh scenarios for every board.** Simple, but expensive and noisy when comparing actions.
- **Cache final Fantasy scores.** Fast, but unusable after board mechanics change.
- **Cache raw role-stat scenarios and rescore them.** Reuses the expensive stochastic world while allowing every hypothetical board to apply its own mechanics.

We chose raw-scenario reuse. Once the scenario bank is generated, changing a stat, quality, or trait requires no new stochastic scenario generation. This both reduces work and makes action comparisons cleaner because competing actions are evaluated against common underlying scenarios.

## 5. Replace brute-force future-menu enumeration with an analytic result

A fresh menu contains three distinct actions drawn from a 20-action catalogue. Explicitly evaluating all `C(20,3) = 1,140` menus is correct but unnecessary when the menu distribution is uniform.

Options:

- enumerate all menus;
- sample menus;
- derive the expected best available operation analytically.

We chose the analytic operator. After sorting operation continuation values, the probability that rank `k` is the best selected action is `C(k-1,2) / C(20,3)`. Tests compare this directly with explicit menu enumeration.

The operator was roughly 30× faster in isolation. Whole-optimizer improvement was modest because menu enumeration was not the dominant cost. We retained the change because it is mathematically equivalent, simpler at runtime, and removes unnecessary work—not because a microbenchmark implied a 30× application speedup.

## 6. Formalize the decision process as a finite-horizon value function

With compact state, reusable scenarios, and an explicit menu model, the two-step optimizer could be expressed as a general finite-horizon decision problem.

Options:

- keep extending special-case two-step logic;
- jump directly to a solver for all remaining tokens;
- introduce the general value-function architecture while leaving production depth unchanged.

We chose the third option. `V(B,t)` represents a board before a future menu is seen; `Q(B,M,t)` represents a board with a visible menu. Board actions, stopping, and spending a token to reroll the menu become alternatives in the same recursion.

Crucially, this architectural generalization did **not** increase production depth. It preserved the existing continuation fidelity described above, and the full ranked action table was regression-tested against the retained pre-value-function implementation for both objectives.

That frozen behavior became the production reference model used by subsequent performance experiments.

## 7. Measure deeper search before approximating it

Once the architecture could express deeper horizons, the obvious question was whether three- or four-spend search was practical.

Options:

- immediately introduce pruning/approximation;
- measure the unmodified production-reference search first.

We chose measurement first so that later approximations would have a meaningful oracle.

The result was decisive. Expected-score `t=3` was roughly 15–18× slower than `t=2` on representative cold workloads and used roughly 1.7–2.1 GiB RSS. Realistic `t=4` cases exceeded the 60-second experimental ceiling. Target-probability search exceeded the same ceiling already at `t=3`.

Instrumentation showed that scenario generation, compact transition generation, and future-menu evaluation were no longer the primary bottlenecks. The dominant problem was the number of **new reachable terminal/action states** introduced by another decision depth.

Production therefore remained capped at two modeled token spends.

## 8. Explore frontier reduction without changing the root decision casually

Once frontier growth was identified, the project tested bounded ways to spend less work on distant continuation states.

Potential approaches included probability truncation, reduced simulation fidelity at depth, progressive action widening, and stronger deterministic continuation compression.

We preferred techniques whose decision error could be measured against completed higher-fidelity searches. Candidate schedules were frozen and evaluated using root-action agreement and regret, rather than selected because they happened to make a benchmark fast.

This produced useful experimental speedups, but target-probability `t=3` remained especially difficult because threshold scoring requires substantially more combinatorial roster/title work.

## 9. Test adaptive precision for target-probability t=3—and accept the negative result

A fixed reduced-fidelity search spends the same amount of work on obvious and close decisions. Adaptive precision offered a better hypothesis: screen all roots cheaply, then spend more work only on plausible contenders.

The candidate family, calibration corpus, selection rule, and separate holdout corpus were frozen before calibration results were inspected.

No candidate passed calibration. Some failed the runtime requirement; others changed the root recommendation by more than the predetermined regret limit. Because no policy qualified, the fresh holdout was **not consumed**.

This is an important part of the engineering process: we did not keep tuning against the same evidence until something passed. The result was recorded as a failed hypothesis, production stayed at `t<=2`, and the untouched holdout was preserved for genuinely new future research.

## 10. Add the five-emblem board without forking the optimizer

When the game introduced a five-emblem layout, we needed to preserve the proven three-emblem behavior while supporting new geometry.

Options:

- fork separate three- and five-emblem applications;
- replace the old layout completely;
- make layout geometry versioned ruleset data used by one engine.

We chose versioned layouts. `legacy_3` and `expanded_5` have distinct identities, and layout identity participates in caches where mechanics depend on geometry. Existing three-slot behavior remained regression-protected.

The five-slot quality-redistribution mechanic was generalized rather than special-cased: select one slot to decrease, then two distinct recipients from the remaining slots. Under three slots, the same rule naturally reproduces the old geometry.

## 11. Make five-emblem t=2 practical with adaptive reference search

The larger board substantially expanded the frontier even at the existing two-spend production horizon.

Options:

- **Add another cache.** Useful only if repeated work is the main cost.
- **Always run full reference search.** Simple, but unnecessarily slow for interactive use.
- **Use a fixed reduced root budget.** Fast, but gives close decisions no additional protection.
- **Spend work according to ambiguity, with full reference fallback.** Fast on clear cases while preserving a containment path for difficult ones.

Profiling showed that new frontier work, not obvious duplicate computation, dominated. A fixed-budget approximation was then tested and failed the required agreement gate on close root decisions.

That failure motivated the adaptive policy:

```text
K=2
→ if ambiguous, K=4
→ if still ambiguous, K=6
→ if still unresolved, full reference search
```

Candidate policies and gates were frozen before the independent holdout was evaluated. The selected `adaptive-tight` policy matched the full reference-search recommendation on all 12 holdout decisions with zero measured regret, delivered a 2.52× median speedup, and reached full reference fallback in 16.7% of cases.

That is evidence of strong agreement on the frozen validation corpus, **not a proof that the adaptive policy is mathematically equivalent on every possible board**. v1.0 therefore describes it as *certified against the frozen validation corpus*. The fallback is part of the policy's risk containment, not a claim that every non-fallback result has been exhaustively proven equivalent.

## 12. Move optimization off the browser's main thread

Even a correct several-second calculation is a poor browser experience if it freezes the page.

Options:

- keep synchronous execution;
- parallelize search across a worker pool;
- first move the existing optimizer behind one Web Worker without changing search semantics.

We chose the single-worker boundary. Requests have identities, superseded work is terminated or ignored, and stale results cannot overwrite newer board/menu/layout state. Browser evidence recorded no main-thread Long Tasks during the tested optimization cases.

Multi-worker search was deliberately deferred: UI responsiveness and search throughput are separate problems, and solving the first did not require introducing distributed-search complexity.

## 13. Decompose the browser application after engine boundaries stabilized

The UI had accumulated rendering, state, controls, and optimizer orchestration in one application layer.

Options included adopting a frontend framework or decomposing the existing vanilla TypeScript application along its now-stable boundaries.

We chose decomposition without a framework. State, controls, board rendering, action rendering, plots, optimizer client, and worker runtime became clearer modules. Doing this after the engine and worker contracts stabilized avoided forcing UI architecture to chase changing backend interfaces.

## 14. Test whether another exact-work cache would unlock deeper target search

The failed adaptive target `t=3` experiment raised a plausible hypothesis: perhaps screening and refinement were repeating expensive target-search preparation.

Instead of implementing another cache immediately, we profiled the boundary.

The important reusable structures already survived across passes: previously scored terminal boards, unchanged role preparation, pair-group target-search work, suffix summaries, and compact transition mechanics. Refinement was expensive mainly because higher fidelity reached **new states and new combinatorial target checks**.

We therefore did not add another cache layer. It would have increased memory and complexity without evidence that it attacked the bottleneck.

The post-v1 deeper-search frontier is consequently clearer: meaningful gains probably require reducing or approximating the number of newly reached decision-relevant states, with explicit error measurement.

## 15. Freeze a v1.0 production boundary

By this point the codebase contained experimental machinery beyond what the evidence justified exposing as a stable product.

Options:

- wait for practical `t=3/t=4` search before releasing;
- expose deeper experimental search with warnings;
- freeze the validated two-spend product and move deeper horizons to a separate research track.

We chose the third option.

| Layout | t=0 | t=1 | t=2 | Deeper |
|---|---|---|---|---|
| 3 Emblems (`legacy_3`) | terminal evaluation | full production-reference search | full production-reference search | unsupported |
| 5 Emblems (`expanded_5`) | terminal evaluation | full production-reference search | certified adaptive reference search with full reference fallback | unsupported |

Both expected-score and target-probability objectives are supported.

The release audit also caught two ordinary product defects—zero-token diagnostics reported the wrong modeled horizon, and root menu reroll could be offered when unavailable—and fixed them before the release contract was frozen. Production statistical/title inputs also gained explicit fail-fast validation.

## What v1.0 represents

The main engineering result is not one optimization. It is a set of explicit ownership boundaries:

```text
rules        → what is legal?
transitions  → what can happen?
scoring      → how valuable is a board?
menu model   → what choices may appear?
search       → what should I do?
worker       → where should computation run?
UI           → what should the user see?
```

Just as importantly, failed experiments remain part of the record. Four-spend production-reference search was not tractable. Adaptive target-probability `t=3` did not pass its runtime/fidelity gate. Additional exact-work caching did not address the measured bottleneck.

Those negative results identify the current frontier: **deeper search is primarily limited by the number of newly reached decision-relevant states, not by board serialization, menu enumeration, stochastic scenario generation, or an obvious missing cache.**

## Remaining v1.0 engineering caveats

A few limitations are intentionally stated rather than hidden:

- The five-emblem adaptive policy has strong frozen-corpus validation, not a universal equivalence proof.
- Some scoring caches persist for the worker/data-model lifetime. No production leak has been demonstrated, but a long-session worker-memory soak test is useful additional release evidence.
- The repository should have one unambiguous source-authority story: canonical source is edited under `src/`, `site/`, and `data/`; generated deployment trees should never be mistaken for independent implementations.
- Linting, formatting automation, and general dead-code detection are maintainability improvements rather than evidence of optimizer correctness. They can be added without changing the mathematical release contract.
