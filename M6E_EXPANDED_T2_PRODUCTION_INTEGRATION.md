# M6E — Expanded-Board t=2 Production Integration

## Status

In progress on `agent/m6e-expanded-t2-production-integration`.

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
| `expanded_5`, t=2 | certified adaptive-tight |
| unsupported / engineering horizons | existing exact/engineering path |

No K-stage control is exposed through the product UI. Search-mode and staged-refinement information are additive engine diagnostics only.

## Fail-safe behavior

The expanded t=2 route validates the certified configuration before use. Integration/runtime invariant failures are caught at the routing boundary and return to the existing exact evaluator. Ambiguity after K=6 performs the policy's certified exact root fallback.

An engineering-only exact-oracle switch remains available to regression and certification tooling; it is not a product control.

## Regression contract

M6E adds tests for:

- policy/artifact consistency;
- `legacy_3` deterministic exact routing for expected-score and target-probability objectives;
- unchanged `expanded_5` t=1 exact routing;
- `expanded_5` t=2 production routing through `adaptive-tight`;
- production-vs-exact root agreement on representative clear and close cases;
- no M5H holdout consumption or t=3/t=4 execution;
- existing deterministic tie-order semantics through the shared recommendation ranking contract.

The complete acceptance corpus is `benchmarks/m6e-expanded-production-integration-fixtures.json`.

## Authoritative benchmark

The Node 22 benchmark is run by `scripts/benchmark-m6e.mjs`. The frozen matrix covers both objectives and the following operation/decision classes:

```text
stat
quality
trait
global quality
mixed
clear root races
close root races
```

It compares the production route with an engineering exact oracle and records:

- root-action agreement;
- oracle regret by objective;
- runtime and speedup;
- adaptive stage distribution;
- exact-fallback rate;
- structural work avoided;
- process memory / maximum RSS.

The benchmark is an integration validation set, not a policy tuning set. M6D certification artifacts remain unchanged.

## Cleanup

The completed M6D one-shot push/finalization trigger sentinels and workflows are removed in M6E. M6D fixtures, scripts, selection, raw results, summary, and certification report remain committed as evidence and reproducibility inputs.

## Acceptance

Final values are populated from the authoritative Node 22 M6E artifact before merge.

| Gate | Required | Result |
|---|---:|---:|
| Build/tests | green | pending |
| Legacy behavioral regressions | 0 | pending |
| Expanded t=2 root agreement | 100% | pending |
| Maximum expected-score regret | 0 | pending |
| Maximum target-probability regret | 0 | pending |
| Exact fallback | functional + tested | pending |
| Certified policy | unchanged | pending |
| Performance | materially faster than exact | pending |

## Exit criterion

M6E is complete only after the production route, exact fail-safe, regression corpus, authoritative Node 22 benchmark, generated deployment output, `PERFORMANCE.md`, and `ENGINEERING_ROADMAP.md` are green and committed in a draft PR.

Then stop. Do not resume target t=3, begin t=4, or start another optimization milestone automatically.
