# Performance

This document records the current production performance contract. Raw experiment results and milestone history are kept in `benchmarks/` and `engineering/history/`.

## Production configuration

| Component | Configuration |
|---|---:|
| Selected-board distribution | 20,000 simulations |
| Team comparison | 6,000 simulations per team |
| Search scenario bank | 48 shared scenarios per team and role |
| Production lookahead | At most 2 token spends |
| Visible-action outcomes | Full modeled distribution |
| Continuation outcomes | Deterministic representative strata |
| Default future menu | Analytic best-of-3 calculation over 20 actions |

Shared scenarios mean competing boards are scored against the same simulated underlying performances. This reduces repeated work and makes comparisons less noisy.

## Production baseline

The v1 production benchmark measures all supported layout, objective, and horizon routes in fresh Node 22 processes.

| Layout | Objective | Horizon | Wall time | Route | End RSS |
|---|---|---:|---:|---|---:|
| 3 Emblems | Expected score | 1 | 204 ms | Full reference | 83.5 MiB |
| 3 Emblems | Expected score | 2 | 978 ms | Full reference | 124.2 MiB |
| 3 Emblems | Target probability | 1 | 380 ms | Full reference | 107.8 MiB |
| 3 Emblems | Target probability | 2 | 4.39 s | Full reference | 418.5 MiB |
| 5 Emblems | Expected score | 1 | 266 ms | Full reference | 83.5 MiB |
| 5 Emblems | Expected score | 2 | 1.14 s | Adaptive with fallback | 128.3 MiB |
| 5 Emblems | Target probability | 1 | 692 ms | Full reference | 131.8 MiB |
| 5 Emblems | Target probability | 2 | 5.64 s | Adaptive with fallback | 452.7 MiB |

These values are a release baseline, not a shared-runner CI timing gate. Compare before-and-after measurements on the same runtime and hardware.

Raw report: `benchmarks/m7b-v1-production-baseline.json`.

## Browser responsiveness

Recommendation search runs in a Web Worker instead of the browser's main thread. The production browser benchmark recorded no main-thread Long Tasks during the measured optimization cases.

Cold requests include worker startup and model loading. Warm requests can reuse the worker and caches. Workers are periodically recycled to limit long-session memory growth.

## Why search stops at two spends

The main performance limit is search-frontier growth. Another token spend creates many new future boards and decisions.

The project removed substantial avoidable work through compact state IDs, reusable simulation scenarios, transition caching, analytic future-menu evaluation, and adaptive search. Deeper search is still expensive because it reaches genuinely new states.

Representative expected-score searches at three spends were roughly 15–18 times slower than two-spend searches at unchanged fidelity. Realistic four-spend experiments exceeded the 60-second research limit. Target-probability search exceeded that limit at three spends.

For this reason, production remains capped at two modeled spends.

## Five-emblem search

Five-emblem boards create more legal targets and reachable states than three-emblem boards. A fixed reduced search budget was fast but could miss close decisions.

The production adaptive policy instead spends more computation when leading actions are close and falls back to full reference search when needed. On its preregistered 12-case holdout, it matched full reference search in all 12 cases with zero measured regret. Full fallback was required in 16.7% of cases.

This is validation on a frozen test set, not a universal equivalence guarantee.

## Target probability

Target-probability search is more expensive than expected-score search because it must repeatedly test whether many roster and title combinations clear a threshold.

The project tested deeper adaptive target-probability policies. None met both the runtime and decision-quality requirements for three-spend production search, so the production horizon was not increased.

## Run benchmarks

Run the broad application and hot-path suite:

```bash
npm run benchmark
```

Write machine-readable output:

```bash
npm run benchmark -- --json=benchmark.json
```

Run the production-route baseline:

```bash
npm run benchmark:v1
```

Run deterministic performance-contract tests:

```bash
npm run test:performance-contracts
```

## Interpret results

- A faster microbenchmark does not guarantee a faster application.
- Cold and warm measurements answer different questions.
- Runtime approximations affect hypothetical continuation, not the legal actions available now.
- Close actions should reduce displayed confidence rather than imply precision the model does not support.

For detailed historical measurements and negative experiments, see `engineering/history/`.