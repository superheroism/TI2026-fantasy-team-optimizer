# Engineering the TI 2026 Fantasy Optimizer

This document explains how the optimizer reached v1.0: the main technical problems, alternatives we tested, evidence we used, and limits we kept.

The guiding rule was simple: **make the decision model trustworthy before making it faster, and measure optimizations before accepting added complexity.** Detailed milestone records are preserved in `engineering/history/`.

## The model in plain language

The optimizer cannot enumerate every possible future Dota match, player performance, reroll, menu, and roster. That state space is too large, and the available data would not justify that level of precision anyway.

Instead, v1.0 defines a **production reference model**: a fixed mathematical version of the Fantasy problem. It contains:

- known game rules;
- explicit assumptions for unpublished reroll/menu probabilities;
- a statistical model of team/role performance;
- a defined approximation for hypothetical future rerolls.

**Reference search** means searching that production model completely at the supported horizon. It does not mean predicting every possible real-world future exactly.

### Rules and probabilities

Known mechanics—stat pools, qualities, traits, action scope, tokens, and scoring—are encoded as rules. Unknown client RNG is represented by explicit assumptions, documented in `CLIENT_RULES_2026.md`.

### Player-performance model

The model represents team/role stat distributions and correlation among stats on the same banner. It applies Fantasy's best-game and best-series retention rules.

When comparing boards, competing actions reuse the same simulated underlying performances. Statistically, this is a **common-random-numbers** design: differences between actions are less contaminated by unrelated simulation noise.

Current gaps include exact game-aligned covariance between paired Core/Support players, opponent effects, game-duration effects, and one shared tournament-advancement path across roles.

### Future rerolls

The visible action is evaluated using its full modeled outcome distribution. Doing the same for every hypothetical action at every future depth causes the search tree to grow very quickly.

For continuation, v1.0 therefore uses a smaller deterministic set of representative outcomes. This is a deliberate approximation: it reduces the number of future states while keeping repeated comparisons reproducible.

## Engineering progression

### 1. Freeze behavior before optimizing it

The original browser tool worked, but there was no safe way to tell whether a speedup changed recommendations.

We first established canonical TypeScript source, deterministic builds, seeded tests, CI, regression cases, and repeatable benchmarks. Target-probability mode was also corrected so free roster/title choices optimize the target probability itself rather than expected score.

This created the basic loop:

```text
change → rebuild → test equivalence → benchmark
```

### 2. Separate mechanics, scoring, and search

The early implementation mixed these responsibilities more than we wanted. We split them so:

```text
rules        → what is legal?
transitions  → what can happen next?
scoring      → how valuable is a board?
menu model   → what choices can appear?
search       → what should the user do?
UI           → what should the user see?
```

This matters because performance work can then change search internals without silently changing Dota rules.

### 3. Encode board state compactly

Human-readable board objects are convenient for the UI but expensive as search keys. Repeated cloning and serialization become costly when thousands of hypothetical boards are visited.

Each emblem's variable state—`stat × quality × trait`—is now encoded into a compact canonical ID. Banners and boards are built from those IDs; role, position, and color remain implicit where they never change.

The old descriptive transition implementation was retained as a reference while the compact version was tested across legal stat combinations, traits, qualities, duplicate-stat rules, probability aggregation, and tier boundaries. The three-emblem encoding tests cover more than ten million valid banner states.

Cold optimizer workloads improved roughly 5–14%. More importantly, search gained cheap, collision-tested identities suitable for caching and dynamic programming.

### 4. Reuse simulated tournament scenarios

A reroll changes how a simulated performance scores; it should not require generating a new simulated tournament.

The engine therefore caches raw role/stat scenarios and rescoring applies the hypothetical banner to those same scenarios. This reduces computation and improves action-to-action comparability.

### 5. Replace 1,140 menu scans with one formula

A future menu is modeled as three distinct actions drawn uniformly from 20. Explicitly scanning all `C(20,3) = 1,140` menus is correct but unnecessary.

After sorting the 20 action values, the probability that rank `k` is the best action present is:

```text
C(k-1, 2) / C(20, 3)
```

The resulting analytic calculation is mathematically equivalent to enumeration under the uniform-menu assumption. It was about 30× faster in isolation, although the whole optimizer improved only modestly because menu enumeration was not the main bottleneck.

### 6. Generalize search with a finite-horizon value function

A **finite-horizon value function** asks: given this board and a fixed number of remaining token spends, what is the best expected final result?

We introduced:

- `V(B,t)` — value of board `B` with `t` spends before seeing a fresh menu;
- `Q(B,M,t)` — value after seeing menu `M`.

Stopping, using a board action, and rerolling the menu are alternatives in the same recursion. This generalized the architecture without increasing the production horizon.

### 7. Measure deeper search before approximating it

Once deeper search was possible, we measured it at unchanged fidelity.

Expected-score `t=3` was roughly 15–18× slower than `t=2` on representative cold workloads and reached roughly 1.7–2.1 GiB RSS. Realistic `t=4` cases exceeded the 60-second experiment limit. Target-probability search exceeded that limit already at `t=3`.

The key finding was **frontier growth**: each extra decision depth creates many genuinely new reachable states. Scenario generation, menu evaluation, and compact transition generation were no longer the dominant costs.

Production therefore stayed at two modeled spends.

### 8. Test controlled approximations

We then tested ways to reduce work in distant continuation states while protecting the root recommendation—the action the user actually takes now.

Two techniques helped:

- **continuation compression:** keep fewer representative future outcomes;
- **progressive action widening:** spend deep search only on the most promising future actions while retaining shallow values for the rest.

Candidate policies were frozen before evaluation and compared with higher-fidelity completed searches using root-action agreement and **regret** (how much utility is lost if the approximate policy chooses the wrong action).

These techniques improved expected-score deep search, but target-probability `t=3` remained difficult.

### 9. Record a failed target-probability experiment

For target-probability `t=3`, we tested adaptive precision: evaluate all root actions cheaply, then refine only plausible contenders.

The candidate family, calibration set, selection rule, and separate holdout were fixed in advance. No candidate met both the runtime and decision-quality gates, so the holdout was intentionally left unused.

We did not tune until something passed. Production remained at `t<=2`.

### 10. Add five-emblem boards without forking the engine

The expanded board was implemented as a versioned layout rather than a second optimizer. `legacy_3` and `expanded_5` have different geometry but share the same rules/search architecture.

Layout identity is included wherever geometry changes mechanics or cache identity. Existing three-emblem behavior remains regression-protected.

### 11. Make five-emblem t=2 practical

The five-emblem board increased the search frontier substantially even at two spends. Profiling showed that the cost came mainly from genuinely new states, not a missing cache.

A fixed reduced root budget was fast but failed on close decisions. We replaced it with an adaptive policy:

```text
K=2
→ if close, K=4
→ if still close, K=6
→ if unresolved, full reference search
```

`K` is the number of root candidates receiving deeper refinement at that stage.

The selected `adaptive-tight` policy matched full reference search on all 12 preregistered holdout decisions, with zero measured regret and a 2.52× median speedup. Full reference fallback was required in 16.7% of cases.

This is strong validation on the frozen corpus, not a universal equivalence proof.

### 12. Move search off the browser UI thread

Several-second search should not freeze the page. Recommendation work now runs in a Web Worker, which executes JavaScript outside the main browser thread.

Requests carry IDs, stale work is cancelled or ignored, and an old result cannot overwrite a newer board state. Browser tests recorded no main-thread Long Tasks during the measured optimization cases.

### 13. Decompose the UI after engine boundaries stabilized

The browser code was then split into state, controls, board rendering, action rendering, plots, worker client, and application orchestration. We kept vanilla TypeScript; a framework was not needed to solve the measured problem.

See `UI_APPLICATION_ARCHITECTURE.md`.

### 14. Test one more exact-work reuse hypothesis

After the failed adaptive target `t=3` experiment, we profiled whether screening and refinement were repeating expensive target-search work.

They were not, to a useful degree. Terminal board scoring, unchanged role preparation, pair-group work, suffix summaries, and compact transitions were already reused. Refinement was expensive because higher fidelity reached new states and new target checks.

We therefore did not add another cache layer. It would have increased memory and complexity without attacking the measured bottleneck.

### 15. Freeze the v1.0 boundary

v1.0 exposes the routes supported by evidence:

| Layout | t=0 | t=1 | t=2 | Deeper |
|---|---|---|---|---|
| 3 Emblems | terminal evaluation | full reference | full reference | research only |
| 5 Emblems | terminal evaluation | full reference | validated adaptive + full fallback | research only |

Both expected-score and target-probability objectives are supported.

## What we learned

The main result is not a single speedup. It is a clearer model of where computation is worth spending.

Cheap state identity, scenario reuse, analytic menu evaluation, and caching removed substantial avoidable work. After those changes, deeper search is still limited mainly by **new decision-relevant states**. More caching is unlikely to unlock long horizons by itself.

Future deep-search work therefore needs to reduce or approximate the frontier while measuring decision error explicitly.

## Remaining caveats

- Five-emblem adaptive search is validated on a frozen corpus, not proven equivalent for every board.
- Some caches live for the worker/model lifetime; workers are recycled to bound long-session growth.
- Generated deployment trees remain committed for the current GitHub Pages setup but are not source authority.
- Linting, formatting, and dead-code tooling improve maintainability but are separate from optimizer correctness.

For exact milestone measurements, negative results, and experimental protocols, see `PERFORMANCE.md`, `benchmarks/`, and `engineering/history/`.