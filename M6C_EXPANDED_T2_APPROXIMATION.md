# M6C — Expanded-Board t=2 Approximation Calibration

**Status:** Outcome B — approximation family failed fidelity/performance gate  
**Frozen base:** `42a1a7ec7553e7d6df5f4d3c5576417fcdbbb35a`  
**Authoritative runtime:** GitHub Actions, Node 22/Linux, isolated child processes with `--expose-gc`

## Frozen design

Calibration and holdout corpora plus the compact candidate grid were committed before candidate results. M6C evaluated one preregistered family: adaptive root refinement with K = 2, 4, or 6 exact second-token board-action refinements. Every legal root board action is still screened with exact one-step mechanics/scoring, while stop and menu reroll remain represented. Unrefined board roots stop after the first action. No stochastic scenario approximation is used inside states that are evaluated.

The old M5D progressive widening mechanism was not reused mechanically at t=2 because at one token remaining its shallow and deep action values both terminate after the action; it therefore does not avoid the expanded terminal frontier that M6B identified.

Acceptance thresholds were frozen in `benchmarks/m6c-expanded-candidates.json` before calibration: 100% completion, >=94% root-action agreement, max expected-score oracle regret <=100, max target-probability regret <=0.005, median speedup >=1.30x, P90 speedup >=1.50x, and median structural work avoided >=20%.

## Calibration

| Candidate | Qualifies | Root agreement | Max expected regret | Max target regret | Median speedup | P90 speedup | Median work avoided |
|---|---:|---:|---:|---:|---:|---:|---:|
| root-k2 | yes | 100.0% | 0.0000 | 0.0000 | 2.7808x | 3.3891x | 71.2% |
| root-k4 | yes | 100.0% | 0.0000 | 0.0000 | 1.7320x | 1.9847x | 44.4% |
| root-k6 | no | 100.0% | 0.0000 | 0.0000 | 1.2542x | 1.4512x | 17.4% |

Frozen calibration selection: **root-k2**.

## One-shot holdout

The holdout was consumed only after `root-k2` was frozen from calibration. It achieved 75.0% root-action agreement, max expected-score regret 0.0000, max target-probability regret 0.0003, median speedup 2.8012x, P90 speedup 3.2658x, and median structural work avoided 71.5%. Holdout gate: **FAIL**.

## Decision

**Outcome B.** No candidate established the required fidelity/performance envelope. Exact expanded_5 t=2 remains the reference implementation.

## Production isolation

No production engine source was changed to enable this approximation. Default layout remains `legacy_3`; production lookahead remains capped at two; legacy expected-score and target-probability behavior remain exact; the M5H holdout is untouched; target t=3/t=4 were not run.

## Evidence

- `benchmarks/m6c-expanded-calibration-fixtures.json` — frozen calibration corpus
- `benchmarks/m6c-expanded-holdout-fixtures.json` — frozen holdout corpus
- `benchmarks/m6c-expanded-candidates.json` — preregistered candidates and gates
- `benchmarks/m6c-expanded-calibration-results.json` — exact oracle + candidate calibration evidence
- `benchmarks/m6c-selection.json` — calibration-only frozen selection
- `benchmarks/m6c-expanded-holdout-results.json` — one-shot holdout evidence
