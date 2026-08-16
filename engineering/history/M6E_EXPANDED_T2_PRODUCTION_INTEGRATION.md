# M6E — Expanded-Board t=2 Production Integration

## Status

**Complete — acceptance gates passed.**

```text
M6E_BASE_SHA = 0e287bf38dd3259e21827245c4bd1c0811e48eba
```

`ENGINEERING_ROADMAP.md` remains the architecture authority. The frozen M6E work package governs this milestone.

## Scope

M6E promotes the M6D-certified `adaptive-tight` staged root-refinement policy to the production search path **only** for `expanded_5` with a two-token modeled horizon. It does not retune the policy, change transition/scoring semantics, expose refinement controls in the UI, or resume target-probability t=3/t=4 work.

## Certified policy wiring

Production policy values are generated from the committed M6D certification artifacts:

- `benchmarks/m6d-selection.json`
- `benchmarks/m6d-expanded-adaptive-candidates.json`

`scripts/generate-m6e-policy.mjs` validates that M6D ended in Outcome A, that `adaptive-tight` is the frozen selected candidate, and that the certified layout/horizon and exact-fallback invariants are intact. It then generates `src/engine/expandedT2AdaptivePolicy.ts`.

Frozen production stages:

```text
screen all board-action roots
→ refine K=2
→ if ambiguous, K=4
→ if ambiguous, K=6
→ if still ambiguous, exact fallback
```

Certified ambiguity thresholds remain unchanged:

| Objective | K=2 | K=4 | K=6 |
|---|---:|---:|---:|
| Expected score | 120 | 80 | 50 |
| Target probability | 0.0015 | 0.0010 | 0.0005 |

Winner-change ambiguity and deterministic root ordering are preserved from M6D.

## Production routing

`recommendNextAction` now distinguishes these paths:

| Layout / horizon | Production search |
|---|---|
| `legacy_3`, any supported production horizon | exact, unchanged |
| `expanded_5`, t=0/1 | exact, unchanged |
| `expanded_5`, production t=2 | certified adaptive-tight |
| explicit engineering horizon override | existing exact/engineering path |
| unsupported / invariant failure | exact fallback |

The explicit engineering override remains exact so the pre-existing M6C/M6D oracle tooling preserves its historical semantics and reproducibility. No K-stage control is exposed through the product UI. Search-mode and staged-refinement information are additive engine diagnostics only.

## Fail-safe behavior

The expanded t=2 route validates the certified configuration before use. Integration/runtime invariant failures are caught at the routing boundary and return to the existing exact evaluator. Ambiguity after K=6 performs the policy's certified exact root fallback.

The regression suite includes a deterministic integration-corpus case that reaches K=6 ambiguity, enters exact fallback, and reproduces the engineering exact oracle recommendation and utility exactly.

## Regression contract

M6E tests cover:

- policy/artifact consistency;
- `legacy_3` deterministic exact routing for expected-score and target-probability objectives;
- unchanged `expanded_5` t=1 exact routing;
- `expanded_5` t=2 production routing through `adaptive-tight`;
- historical explicit t=2 engineering overrides remaining exact;
- exact-fallback equivalence after K=6 ambiguity;
- production-vs-exact root agreement on representative clear and close cases;
- no M5H holdout consumption or t=3/t=4 execution;
- existing deterministic tie-order semantics through the shared recommendation ranking contract.

The complete acceptance corpus is `benchmarks/m6e-expanded-production-integration-fixtures.json`.

## Authoritative Node 22 benchmark

The frozen 12-case integration matrix covers expected-score and target-probability objectives across stat, quality, trait, global-quality, mixed, clear, and close cases. It compares the normal production route against an isolated engineering exact oracle.

Environment: Node `v22.23.2`, Linux x64, AMD EPYC 7763 runner.

| Metric | Result |
|---|---:|
| Root-action agreement vs exact | **100.0%** |
| Maximum expected-score regret | **0** |
| Maximum target-probability regret | **0** |
| Median production runtime | 4,239.3 ms |
| Median speedup vs exact | **1.66×** |
| P90 speedup vs exact | 2.85× |
| Median structural work avoided | 41.8% |
| Exact-fallback rate | 41.7% |
| K=2 completion | 41.7% |
| K=4 completion | 16.7% |
| K=6 completion | 0.0% |
| Exact fallback | 41.7% |
| Maximum production RSS | 1,038.3 MiB |

All acceptance gates passed.

### Performance interpretation

The 1.66× integration-corpus median is lower than M6D's 2.52× holdout median, but this is explained by corpus composition rather than an implementation regression. The M6E matrix deliberately contains more ambiguous production-integration cases and exact-falls back in 5/12 cases (41.7%), versus 16.7% on the M6D certification holdout. Those exact-fallback cases are necessarily near 1×; non-fallback cases retain substantial acceleration, including roughly 2.14–3.16× on several expected-score cases and 1.86–2.90× on several target-probability cases. The frozen M6D policy was not changed in response.

Raw evidence is committed in:

- `benchmarks/m6e-production-integration-results.json`
- `benchmarks/m6e-production-integration-report.md`

The M6D holdout remains certification evidence and was not used as a tuning set.

## Cleanup

The completed M6D one-shot push/finalization trigger sentinels and workflows are removed in M6E. M6D fixtures, scripts, selection, raw results, summary, and certification report remain committed as evidence and reproducibility inputs.

The temporary M6E execution workflow is also removed after committing its authoritative benchmark evidence; the reproducible benchmark scripts and artifacts remain.

## Acceptance

| Gate | Required | Result |
|---|---:|---:|
| Build/tests | green | **PASS** |
| Legacy behavioral regressions | 0 | **PASS** |
| Expanded t=2 root agreement | 100% | **100% — PASS** |
| Maximum expected-score regret | 0 | **0 — PASS** |
| Maximum target-probability regret | 0 | **0 — PASS** |
| Exact fallback | functional + tested | **PASS** |
| Certified policy | unchanged | **PASS** |
| Performance | materially faster than exact | **1.66× median — PASS** |

## Exit criterion

M6E is complete when the final regression suite remains green after documentation/cleanup and the draft PR is open.

Then stop. Do not resume target t=3, begin t=4, or start another optimization milestone automatically.
