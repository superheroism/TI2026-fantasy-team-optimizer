# Performance

This file summarizes the current performance contract and the measurements that shaped v1.0. Detailed experiment logs live in `engineering/history/`; raw results live in `benchmarks/`.

## Current production configuration

| Component | Configuration |
|---|---:|
| Selected-board distribution | 20,000 simulations |
| Team comparison | 6,000 simulations per team |
| Search scenario bank | 48 shared raw scenarios per team/role |
| Production lookahead | at most 2 token spends |
| Visible-action outcomes | full modeled distribution |
| Continuation outcomes | deterministic representative strata |
| Uniform future menu | analytic best-of-3 calculation over 20 actions |
| Non-uniform menu override | explicit `data.menuSamples` evaluation |

**Shared scenarios** means competing boards are scored against the same simulated underlying performances. This reduces repeated work and makes action comparisons less noisy.

## v1.0 production baseline

M7B measured all eight supported layout × objective × horizon routes in fresh Node 22 processes. These numbers are a release baseline, not a CI timing gate.

| Layout | Objective | Horizon | Wall time | Route | End RSS |
|---|---|---:|---:|---|---:|
| 3 Emblems | expected score | t=1 | 204 ms | full reference | 83.5 MiB |
| 3 Emblems | expected score | t=2 | 978 ms | full reference | 124.2 MiB |
| 3 Emblems | target probability | t=1 | 380 ms | full reference | 107.8 MiB |
| 3 Emblems | target probability | t=2 | 4.39 s | full reference | 418.5 MiB |
| 5 Emblems | expected score | t=1 | 266 ms | full reference | 83.5 MiB |
| 5 Emblems | expected score | t=2 | 1.14 s | adaptive-tight | 128.3 MiB |
| 5 Emblems | target probability | t=1 | 692 ms | full reference | 131.8 MiB |
| 5 Emblems | target probability | t=2 | 5.64 s | adaptive-tight | 452.7 MiB |

All route checks passed. The five-emblem `t=2` route can fall back to full reference search when the adaptive policy cannot confidently separate the leading actions.

Raw report: `benchmarks/m7b-v1-production-baseline.json`.

## Browser responsiveness

Recommendation search runs in a Web Worker rather than on the browser's main thread. In the M6F browser benchmark, all five tested routes recorded **0 ms of main-thread Long Tasks** during optimization.

Cold requests include worker startup and model loading; warm requests reuse the worker and caches. The worker is periodically recycled to bound long-session cache growth.

Raw report: `benchmarks/m6f-browser-performance.json`.

## Why production stops at two spends

The limiting factor is the **search frontier**: the number of distinct future boards and decisions created by another token spend.

At unchanged fidelity, representative expected-score `t=3` searches were about 15–18× slower than `t=2`. Realistic `t=4` searches exceeded the 60-second experiment limit, and target-probability search exceeded that limit already at `t=3`.

The project tested several ways to reduce avoidable work before accepting that boundary.

## Major performance findings

| Milestone | Change | Result |
|---|---|---|
| M3 | compact canonical board state | ~5–14% faster representative cold optimizer cases; much cheaper state identity |
| M4 | analytic future-menu operator | ~30× faster menu calculation in isolation; modest whole-app gain |
| M4 | shared raw scenario banks | hypothetical boards reuse player-performance simulations |
| M5B | remove low-reuse caches / descriptive terminal boards | default `t=3` cold 22.85 s → 17.59 s; max RSS ~1.76 GiB → 418 MiB |
| M5C | compress distant continuation outcomes | default `t=3` 19.12 s → 10.77 s under aggressive research schedule |
| M5D | progressively widen distant actions | selected wide policy preserved calibration root actions at ~0.51× runtime |
| M6D | adaptive five-emblem root refinement | 12/12 holdout agreement; 2.52× median speedup; 16.7% full fallback |
| M6E | production integration | 12/12 integration agreement; 1.66× median speedup on broader corpus |
| M7A | profile another target-search reuse cache | negative result: refinement cost was mostly new work, so no cache added |

### A note on “exact” versus “reference”

Older milestone files sometimes use **exact** to mean exact evaluation of the model defined at that time. Public v1.0 documentation uses **reference search** instead, because continuation itself contains a deliberate representative-outcome approximation.

## Target-probability search is harder

Expected-score evaluation can accumulate scalar score expectations relatively cheaply. Target probability asks whether many roster/title combinations clear a threshold, which requires substantially more combinatorial checking.

In M5G, exact target-kernel work across the frozen validation set ranged from roughly **5.75B to 38.01B scenario checks** depending on state and threshold. This variation is why one target benchmark is not enough to certify a deeper policy.

M5H tested preregistered adaptive `t=3` policies. None met both the runtime and decision-quality gates, so the separate holdout was left unused and production remained at `t<=2`.

## Five-emblem expansion

Moving from 3 to 5 emblems increased the number of legal targets and reachable states. M6B showed that the slowdown was mostly genuine frontier growth, not a missing cache.

For target probability at `t=2`, the profiled scalar target states grew from **6,563 to 17,862**, and exact scenario checks from about **433M to 1.384B**.

A fixed reduced root budget was fast but failed on close decisions. The later `adaptive-tight` policy solved this by escalating ambiguous cases and falling back to full reference search when needed.

## Benchmarking

The supported performance surface is intentionally small. Run the broad hot-path/application suite:

```bash
npm run benchmark
```

Write machine-readable output:

```bash
npm run benchmark -- --json=benchmark.json
```

Run the eight-route v1.0 production baseline:

```bash
npm run benchmark:v1
```

Run the deterministic performance contracts used by CI tests:

```bash
npm run test:performance-contracts
```

Timing thresholds are not enforced in shared-runner CI because machine variance would make them noisy. Compare before/after reports on the same runtime and hardware.

## Interpretation rules

- A microbenchmark speedup is not automatically an application speedup.
- Cold and warm results answer different questions; report both when cache behavior matters.
- Runtime approximations affect hypothetical continuation, not the legal root action set.
- Near-tied actions should lower displayed confidence rather than imply precision the model does not have.
- Negative experiments are retained when they identify the real bottleneck.

For full milestone-by-milestone diagnostics, see `engineering/history/README.md`.
