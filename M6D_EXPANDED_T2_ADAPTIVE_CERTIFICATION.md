# M6D — Expanded-Board t=2 Adaptive Exact Certification

**Status:** Outcome A — adaptive certification validates  
**M6D_BASE_SHA:** `7757654ff91a4ca7a4f2fb7cad556620efc88140`  
**Authoritative benchmark:** GitHub Actions run `31914003027`, Node 22/Linux

## Frozen design

Fresh calibration and holdout corpora plus the candidate/gate file were committed before measurement. M6C holdout data were used only as diagnostic motivation and were not reused for M6D validation.

Every candidate screens all legal roots, incrementally refines K=2 → K=4 → K=6, and falls back to exact evaluation of every remaining root if the winner still changes or the objective-specific winner/runner-up gap remains below the frozen threshold. Stop and menu reroll remain represented at all stages. No mechanics, stochastic scenario fidelity, scoring, objective, tie-breaking, or production defaults changed.

## Calibration

| Candidate | Qualified | Agreement | Max ES regret | Max target regret | Median speedup | P90 speedup | Exact fallback |
|---|---:|---:|---:|---:|---:|---:|---:|
| adaptive-tight | yes | 100.0% | 0.00 | 0.000000 | 1.81× | 2.81× | 33.3% |
| adaptive-balanced | yes | 100.0% | 0.00 | 0.000000 | 1.62× | 2.58× | 38.9% |
| adaptive-conservative | no | 100.0% | 0.00 | 0.000000 | 1.25× | 2.62× | 44.4% |

Calibration selected **adaptive-tight** using the preregistered selection rule only. Thresholds and candidate identity were frozen before holdout.

## One-shot holdout

The frozen adaptive-tight policy passed the M6D holdout gate.

| Metric | Result | Gate |
|---|---:|---:|
| Completion | 100.0% | 100% |
| Root-action agreement | 100.0% | >=98% |
| Max expected-score regret | 0.00 | <=100 |
| Max target-probability regret | 0.000000 | <=0.001 |
| Median speedup | 2.52× | >=1.50× |
| P90 speedup | 3.27× | >=1.20× |
| Median structural work avoided | 67.2% | report |
| Exact fallback | 16.7% | report |

Stage reached: K=2 58.3%, K=4 16.7%, K=6 8.3%, exact fallback 16.7%. Maximum measured RSS was 1120.1 MiB.

All 12 holdout decisions matched the exact oracle with zero regret. The two exact-fallback cases were target-probability ties (oracle winner/runner-up gap 0), which is the intended failure-mode containment behavior. Target-probability cases were slower than expected-score cases because ambiguity correctly caused deeper refinement; the aggregate gate still passed materially.
## Interpretation

**Outcome A.** Adaptive staged refinement achieves near-exact decision fidelity with material aggregate speedup on the fresh expanded-board t=2 validation set. Easy decisions usually stop at K=2; ambiguous decisions consume additional exact work; ties can reach full exact fallback. This directly addresses the M6C failure mode without globally paying exact-search cost.

This result certifies the engineering policy for a separate production-integration decision. It does **not** enable the policy in production, extend the production horizon, validate target t=3/t=4, or alter M5H conclusions.

## Production isolation

- default layout remains `legacy_3`;
- production modeled horizon remains <=2;
- adaptive expanded policy remains disabled by default;
- legacy expected-score and target-probability behavior are unchanged;
- M5H holdout is untouched;
- target t=3/t=4 were not run.

## Evidence

- `benchmarks/m6d-expanded-calibration-fixtures.json`
- `benchmarks/m6d-expanded-holdout-fixtures.json`
- `benchmarks/m6d-expanded-adaptive-candidates.json`
- `benchmarks/m6d-expanded-calibration-results.json`
- `benchmarks/m6d-expanded-holdout-results.json`
- `benchmarks/m6d-selection.json`
- workflow artifacts `m6d-expanded-t2-calibration` and `m6d-expanded-t2-holdout` from run `31914003027`.
