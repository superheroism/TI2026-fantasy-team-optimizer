# M5H — Adaptive Target-Probability t=3 Precision

## Status

**Frozen work package — execution begun.**

- `M5H_BASE_SHA`: `64a7796da307575b0b83d5d80b72e803e57ea41f`
- Base is the current `main` immediately after M5G merge PR #14.
- Objective: `P(final score >= targetScore)`.
- Experimental horizon: `t = 3`.
- Production remains capped at `t <= 2`.
- M5G is diagnosis/training evidence only; its 27 cases are not fresh M5H validation evidence.

`ENGINEERING_ROADMAP.md` remains the architecture authority. This file is the frozen M5H work-package authority.

## Objective and hypothesis

Test whether deterministic adaptive allocation of existing target-t=3 search fidelity can satisfy the existing decision-quality standard inside the strict runtime envelope:

```text
cheap complete t=3 screen
        ↓
identify decision-relevant root contenders
        ↓
selectively refine only those contenders
        ↓
final common root comparison
```

M5G established Outcome B: current-fidelity t=3 completed all 27 cases, while Aggressive `4→2→1` + Wide `12→8→4` completed under 60 seconds in only 15/27 and disagreed on `holdout-05 @ 60k` with 1.063 pp oracle regret. Exact-kernel work varied materially by state/threshold (~5.75B–38.01B oracle scenario checks), motivating adaptive rather than fixed fidelity.

The package succeeds only if a cheaper complete screen recovers enough compute **and** selective refinement preserves the frozen decision-quality gate.

## Hard invariants

M5H must not change target-probability semantics, target-kernel mathematics, scenario count/stochastic model, Dota transitions, menu probabilities, current/root visible-menu fidelity, stop/menu-reroll semantics, free roster/title optimization, production `t<=2`, or the existing M5C/M5D schedules. It may compose existing schedules adaptively but may not create a hidden lower-fidelity transition approximation.

Search behavior must be deterministic and independent of wall clock. Process timeouts are measurement guards only.

All 20 future operation identities remain represented in the fresh-menu model. Root/current-menu actions are never widened away.

## Adaptive policy contract

### Stage 1 — complete screen

Evaluate stop, menu reroll, and every legal visible root action using one preregistered cheaper combination of existing M5C continuation and M5D widening policies. Root/current-menu transitions remain full fidelity.

### Stage 2 — deterministic contender selection

Use screening information only. Oracle values and elapsed time are forbidden trigger inputs. Eligible triggers are root rank and screened utility gap from the screened winner. Stop and menu reroll participate under the same rule as board actions.

### Stage 3 — selective refinement

Recompute only selected root contenders under the preregistered higher-fidelity existing M5C/M5D combination. Reuse semantics-safe stochastic/terminal/transition/target-search work where possible. Incremental refinement diagnostics are reported separately.

### Stage 4 — common final comparison

For each root alternative use its refined value if refined, otherwise its screened value, then apply the existing deterministic root tie-breaking semantics. Adaptive precision creates no new user-visible action type.

## Required attribution

For each root alternative and fidelity pass retain, where available:

- target-kernel scenario checks and elapsed time;
- terminal evaluations;
- V/Q/action evaluations;
- fresh-menu evaluations;
- transition work;
- target-search branching/candidate counts;
- cache hits/misses;
- screened and refined utility;
- refinement trigger reason.

Screening and incremental refinement work must be separable so the report can distinguish an expensive screen, over-broad refinement, root-specific kernel cost, state-wide difficulty, and threshold-specific difficulty.

## Data discipline

### M5G

The M5G corpus is diagnostic only. `holdout-05 @ 60k` remains a regression sentinel and cannot count as new validation evidence.

### Calibration corpus

Generate a deterministic new calibration corpus from a new fixed seed using existing legal state-generation/replay machinery. Freeze a manifest before candidate measurements. Cross each state with `50_000`, `55_000`, `60_000`; preserve fixture ID, seed/path, reachability class, BoardStateID, descriptive board, menu, and thresholds. Persist current-fidelity t=3 oracles once.

### Holdout corpus

Before inspecting calibration results, freeze a separate manifest from a different seed: 9 states × 3 thresholds = 27 cases. Candidate holdout execution is forbidden until the candidate family, calibration selection rule, selected candidate/configuration, implementation commit, and holdout gate are frozen. Once holdout starts, no retuning is allowed.

## Bounded candidate family

The exact preregistered candidate table lives in `benchmarks/m5h-target-adaptive-candidates.json`. It is intentionally small and uses only existing M5C/M5D primitives. No candidate may be added or modified after calibration measurements are inspected.

Allowed dimensions are screening schedule, refinement schedule, top-k/margin refinement rule, preregistered margin, and maximum number refined.

## Calibration selection rule

Eliminate semantic/integrity failures first. A qualifying candidate must have:

```text
no non-waivable root reversal
max oracle regret <= 0.25 pp
mean oracle regret <= 0.05 pp
no stop/menu reversal
```

Runtime must also be viable for the 60-second envelope. Among qualifying candidates prefer, in order:

1. lower maximum oracle regret;
2. higher root-action agreement;
3. lower P90 runtime;
4. lower median runtime;
5. simpler adaptive rule.

If no candidate satisfies accuracy and runtime requirements simultaneously, stop with **Outcome C** without consuming the fresh holdout.

## Authoritative holdout gate

Outcome A requires all of:

```text
27/27 current-fidelity oracles complete in <600 s
27/27 adaptive candidates complete in <60 s
all completed deep runs <6 GiB max RSS
27/27 t=2 production-isolation controls identical
all frozen BoardStateIDs reconstruct exactly
all 20 future operation identities remain represented
threshold-probability monotonicity holds
production horizon remains 2
```

Policy quality:

```text
root-action agreement >= 26/27
at most one disagreement may be waived only when:
  both choices are board actions
  oracle top-two gap <= 1.00 pp
  oracle regret <= 0.25 pp
stop/menu disagreement: never waivable
mean oracle regret <= 0.05 pp
max oracle regret <= 0.25 pp
```

Timed-out/incomplete candidates are failed cases, never agreements or zero regret.

The holdout report must include refinement frequency/count, screen vs final winner, screen/final vs oracle agreement, regret recovered, incremental refinement runtime/kernel checks, unchanged/corrected/introduced-error counts, and breakdowns by threshold, reachability class, root action family, and stop/menu vs board action.

## M5G sentinel

Run final M5H policy on `holdout-05 @ 60k` and document whether the screen still chooses Mid, whether refinement triggers, whether Core is recovered, and incremental work. Sentinel success is diagnostic only.

## Production isolation and adversarial tests

Regression coverage must prove adaptive machinery is inactive unless engineering-only target-t=3 configuration is explicitly supplied. Normal optimizer calls remain `t<=2`; existing t=2 ranked tables, expected-score behavior, default target-probability behavior, UI/deployment behavior remain identical.

Synthetic tests must cover: separated winner/no refinement; two close board actions; board action vs stop; board action vs menu reroll; winner change/no change; deterministic ties; timeout handling; incomplete outputs not counted as agreements; all 20 future operation identities under widening; threshold monotonicity; and cache reuse numerical equivalence.

## Performance engineering rules

Measure before optimizing. A semantics-preserving hot-path optimization is allowed only when profiling demonstrates relevance, exact equivalence tests are added, search/scenario fidelity is unchanged, and before/after benchmarks are recorded. No new approximation may be hidden as performance work.

## Authoritative environment

Deep calibration/validation runs use GitHub Actions, Node 22, Linux, a separate Node process per deep case, clean run-scoped search caches, and `--expose-gc`. Oracle and candidate should share a runner per case where practical. Raw case JSON is persisted before aggregation. Aggregates consume only explicitly named case artifacts; preflight/sentinel files are excluded by construction and regression-tested.

## Required deliverables

- `M5H_TARGET_T3_ADAPTIVE_PRECISION.md`
- `benchmarks/m5h-target-calibration-fixtures.json`
- `benchmarks/m5h-target-holdout-fixtures.json`
- `benchmarks/m5h-target-adaptive-calibration.json`
- `benchmarks/m5h-target-adaptive-holdout.json`
- `PERFORMANCE.md` update
- adaptive semantics / t=2 isolation / gate aggregation tests
- authoritative Node 22 workflow artifacts
- draft PR

Large raw measurements may remain workflow artifacts; committed aggregates must reproduce every report table/gate statement.

## Outcomes

**A — adaptive target t=3 validated:** all frozen holdout gates pass. Production still remains `t<=2`; t=3 remains engineering-only; do not begin t=4.

**B — adaptive target t=3 still not robust:** any hard holdout gate fails. Classify dominant cause as runtime, policy fidelity, memory, semantic/integrity, or mixed; do not retune against holdout; recommend one bounded next technique.

**C — calibration cannot produce a viable candidate:** no preregistered candidate satisfies calibration quality and performance simultaneously. Stop before holdout.

## Explicit non-goals

Do not begin t=4, expose t=3 in production, increase production horizon, change target semantics/kernel/scenario budgets, introduce learned value functions or approximate state similarity/interpolation, add worker parallelism, tune against holdout, or reinterpret M5G timeouts as successful comparisons.

## Exit criterion

M5H ends only when committed evidence establishes exactly one of A, B, or C. Then update the engineering record, open/retain a draft PR, and stop without merging.