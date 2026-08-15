# M5H — Adaptive Target-Probability t=3 Precision

## Status

**Complete — Outcome C.**

- `M5H_BASE_SHA`: `64a7796da307575b0b83d5d80b72e803e57ea41f`
- Authoritative measurement SHA: `aad253d621939bd391593a85fe0bae0b7d6d1265`
- Objective: `P(final score >= targetScore)`
- Experimental horizon: `t = 3`
- Production remains capped at `t <= 2`
- Fresh calibration seed: `2026081501`
- Fresh holdout seed: `2026081502`
- Authoritative calibration result: **Outcome C — no preregistered adaptive candidate qualified for holdout**
- Fresh holdout: **not consumed**

`ENGINEERING_ROADMAP.md` remains the architecture authority. This file is the frozen M5H work-package record.

## Question tested

M5H tested whether deterministic adaptive allocation of the already-defined M5C/M5D target-search fidelity could make target-probability `t=3` robust inside the 60-second candidate envelope without changing target semantics, target-kernel mathematics, scenario count, transition mechanics, menu probabilities, root/current-menu fidelity, stop/menu-reroll semantics, or production `t<=2` behavior.

The tested architecture was:

```text
cheap complete t=3 screen
        ↓
identify decision-relevant root contenders
        ↓
selectively refine only those contenders
        ↓
final common root comparison
```

M5G was used only as diagnosis data. Its 27 cases, including `holdout-05 @ 60k`, were not reused as fresh M5H validation evidence.

## Frozen experimental design

Before calibration results were inspected, M5H froze:

- an eight-policy candidate family in `benchmarks/m5h-target-adaptive-candidates.json`;
- a deterministic 9-state calibration corpus crossed with `50k / 55k / 60k`;
- a separate deterministic 9-state holdout corpus from a different seed, also crossed with `50k / 55k / 60k`;
- the calibration selection rule;
- the authoritative holdout gate;
- exact artifact allowlists excluding preflight and sentinel files;
- a stale-measurement authority guard;
- Node 22/Linux child-process measurement with 600-second oracle and 60-second candidate guards.

The adaptive candidates used only existing M5C continuation and M5D widening schedules. Root actions, stop, and menu reroll remained eligible under the same deterministic contender rules. All 20 future operation identities remained represented in the fresh-menu model.

## Calibration integrity

The authoritative calibration aggregate is `benchmarks/m5h-target-adaptive-calibration.json`, generated from measurement SHA `aad253d621939bd391593a85fe0bae0b7d6d1265`.

The base controls passed:

| Control | Result |
|---|---:|
| Expected calibration cases | 27 |
| Current-fidelity oracles completed | 27/27 |
| Oracle memory under 6 GiB | pass |
| All 20 future operation identities retained by oracles | pass |
| t=2 current controls | 27/27 |
| t=2 experimental controls | 27/27 |
| Production isolation | pass |

Thus Outcome C is not caused by an oracle failure, production regression, or corrupted calibration corpus.

## Fixed M5G-policy baseline on the fresh calibration corpus

The required M5G baseline — Aggressive `4→2→1` continuation plus Wide `12→8→4` widening — remained an informative comparator but was not eligible for selection.

It completed only **18/27** calibration runs within the measurement guard. Among those completed runs it agreed with the oracle on **14/18** and disagreed on four. Its completed-run runtime median was **41.88 s**, P90 **52.00 s**, and maximum **54.13 s**. Mean oracle regret over completed comparisons was **0.0215 pp** and maximum regret was **0.2693 pp**, already above the frozen `0.25 pp` maximum-regret limit.

This independently reproduces the M5G conclusion on fresh states: fixed fidelity is neither reliably fast enough nor decision-robust enough for experimental target `t=3`.

## Adaptive calibration result

**No one of the eight preregistered adaptive policies satisfied the frozen calibration requirements.** The aggregate therefore emitted `outcome: "C"` and did not create `benchmarks/m5h-selected-candidate.json`.

The failure was mixed:

1. **Runtime/completeness:** even the adaptive policies did not complete all 27 cases inside the 60-second guard. For example, A1 completed 26/27; A2 completed 23/27; A3 completed 21/27. An incomplete policy cannot qualify regardless of accuracy on completed cases.
2. **Policy fidelity:** completed comparisons still contained non-waivable root reversals and maximum-regret violations. A1 reached **0.6450 pp** maximum regret; A2 reached **0.2693 pp**; A3 reached **0.6450 pp**. These exceed the frozen `0.25 pp` maximum-regret gate.
3. **Shared semantic controls held:** the calibration aggregate reports shared integrity and production isolation intact. The failure is therefore not a target-semantics or t=2-isolation regression.

Representative failure cases show why selective refinement was insufficient. On `calibration-05 @ 55k`, the oracle preferred Mid → `red-quality-last`, while A1/A2/A3 selected Mid → `green-stat-all`; oracle regret was **0.2693 pp**. At `calibration-05 @ 60k`, the same reversal cost **0.2052 pp**. A1 also produced a larger `calibration-09 @ 50k` reversal from Core → `red-quality-last` to Mid → `green-trait-all`, with **0.6450 pp** regret.

The important pattern is not simply that refinement was too weak or too broad. The screen can rank the wrong action outside the refined set, while increasing refinement fidelity/coverage consumes enough additional target-kernel work to threaten the runtime envelope. Within the bounded family, the two requirements did not meet.

## Holdout discipline

Because calibration produced no qualifying candidate, the workflow stopped at the preregistered Outcome C boundary.

The fresh holdout manifest remains frozen in `benchmarks/m5h-target-holdout-fixtures.json`, but **no adaptive holdout measurement was executed and no `benchmarks/m5h-target-adaptive-holdout.json` exists**. This is intentional. Consuming a fresh holdout for a policy already known to fail calibration would provide no valid selection evidence and would waste the corpus.

Likewise, there is no final selected M5H policy to run against the M5G `holdout-05 @ 60k` diagnostic sentinel. The sentinel remains diagnostic evidence from M5G rather than a substitute for fresh validation.

## Outcome

### Outcome C — calibration cannot produce a viable candidate

The core hypothesis was not established. Adaptive precision using the bounded compositions of existing M5C/M5D schedules did recover substantial compute in some cases, but no preregistered policy simultaneously achieved complete sub-60-second execution and the frozen decision-quality standard.

Dominant cause: **mixed runtime + policy fidelity**.

This is a stronger negative result than simply observing another difficult fixed-fidelity case: the package explicitly tested whether selective higher-fidelity recomputation could bridge the gap, and the bounded family could not do so without either timing out or retaining decision-sensitive errors.

## Production decision

No production behavior changes.

```text
production target horizon: t <= 2
target t=3: engineering-only / not validated
target t=4: not begun
```

Adaptive machinery remains structurally inactive unless the engineering-only deep-search configuration is explicitly supplied. The calibration t=2 isolation controls passed 27/27.

## Recommended next bounded technique

Do **not** tune additional margin thresholds or refinement counts against these calibration outcomes and do not consume the frozen M5H holdout.

The next package should target **root-specific exact-search work reuse / incremental target-kernel preparation across screening and refinement**, rather than another search-fidelity approximation. M5H shows that the adaptive decision rule is squeezed between two constraints: cheap screens can mis-rank decision-relevant roots, while sufficiently broad higher-fidelity recomputation duplicates enough expensive target-kernel work to exceed the envelope.

A bounded follow-up should therefore profile and eliminate duplicated exact preparation/evaluation work between fidelity passes while preserving the same target probabilities and frozen search schedules. It should establish exact equivalence first and only then reconsider whether adaptive refinement has enough compute headroom. Do not begin target `t=4`.

## Evidence

Committed evidence:

- `benchmarks/m5h-target-adaptive-candidates.json`
- `benchmarks/m5h-target-calibration-fixtures.json`
- `benchmarks/m5h-target-holdout-fixtures.json`
- `benchmarks/m5h-target-adaptive-calibration.json`
- M5H adaptive semantics, t=2 isolation, fixture replay, timeout/incomplete-output, artifact-filter, and aggregation tests
- `.github/workflows/m5h-target-adaptive.yml`

Authoritative raw per-case measurements remain in GitHub Actions run `31895777023` artifacts.

## Exit criterion

M5H is complete with committed **Outcome C** evidence. Stop here: do not consume the holdout, expose `t=3` in production, begin `t=4`, or retune the bounded candidate family.