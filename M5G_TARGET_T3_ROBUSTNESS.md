# M5G — Target-Probability t=3 Robustness Validation

## Status

**Outcome B — robustness not established.**

- M5G_BASE_SHA: `a138a7b968350e97261c2631c8298521d07b72d4`
- Authoritative measurement SHA: `fadf4085d0592bcc9374e4172c134887b5fa2a51`
- Source GitHub Actions run: `31890281254`
- Production modeled horizon remains **2**.
- No target t=3 production exposure, t=4 work, M5C/M5D retuning, scenario-budget change, or target-kernel redesign was introduced.

The authoritative 27-case matrix completed. The original aggregate step then failed because it attempted to parse the npm-decorated preflight plan as case JSON. That reporting-only defect was corrected after measurement; the measurements below are reconstructed from the exact original 27 case artifacts plus the original preflight/sentinel artifact.

## Frozen corpus and policies

The corpus is exactly the canonical M5F state plus all eight frozen M5D holdouts, crossed with targets **50,000 / 55,000 / 60,000**: 9 states × 3 thresholds = 27 cases.

Oracle: t=3, current continuation fidelity, no action widening, 600 s timeout.  
Candidate: t=3, aggressive continuation **4→2→1**, Wide action widening **12→8→4**, 60 s timeout.  
Root/current-menu fidelity remained full.

## Preflight, fixture integrity, and production isolation

- Typecheck / generated verification / full tests: **passed**
- Frozen M5G plan tests: **passed**
- Canonical M5F 55k reproducibility sentinel: **passed**
- Frozen BoardStateID reconstruction: **9/9 passed**
- t=2 production-isolation ranked-table equality: **27/27 passed**
- Exact/current oracles completed: **27/27**
- Candidate completed within 60 s: **15/27**
- Candidate timeouts: **12/27**

## Hard-gate result

Failed frozen checks: `allCandidatesUnder60s`, `memoryUnder6Gb`, `all20FutureOperations`, `thresholdMonotonicity`, `topActionAgreement`, `maxRegret`.

The principal substantive failures are:

1. **Candidate runtime robustness failure:** 12 of 27 candidate cases reached the fixed 60 s timeout.
2. **Policy robustness failure:** `holdout-05 @ 60k` selected a different root action. The oracle chose `red-quality-random` on **Core**; the candidate chose the same operation on **Mid**. Oracle top-two gap = **1.063 pp** and oracle regret = **1.063 pp**, both beyond the frozen waiver limits (1.00 pp gap, 0.25 pp regret).
3. The frozen monotonicity/all-20/memory aggregate checks also report false where candidate outputs are missing because of timeout. Among completed runs, all 20 future operation identities were present and completed-run RSS stayed below 6 GB; all nine oracle threshold triplets were monotone, and all three fully completed candidate threshold triplets (`holdout-02`, `holdout-03`, `holdout-08`) were monotone. These observations do **not** rescue the hard gate.

## Per-case results

| Fixture | Target | Oracle status | Oracle winner | Oracle s | Candidate status | Candidate winner | Candidate s | Oracle regret | Kendall τ | Top-3 |
|---|---:|---|---|---:|---|---|---:|---:|---:|---:|
| canonical-default | 50k | completed | board_action|red-quality-all|core | 185.72 | completed | board_action|red-quality-all|core | 58.80 | 0.000 pp | 1 | 3/3 |
| canonical-default | 55k | completed | board_action|red-quality-all|core | 198.28 | timeout | — | 60.20 | — | — | — |
| canonical-default | 60k | completed | board_action|red-quality-all|core | 153.70 | completed | board_action|red-quality-all|core | 59.26 | 0.000 pp | 1 | 3/3 |
| holdout-01 | 50k | completed | board_action|blue-quality-all|support | 305.49 | timeout | — | 60.17 | — | — | — |
| holdout-01 | 55k | completed | board_action|blue-quality-all|support | 223.97 | timeout | — | 60.18 | — | — | — |
| holdout-01 | 60k | completed | board_action|blue-quality-all|support | 156.36 | completed | board_action|blue-quality-all|support | 58.87 | 0.000 pp | 1 | 3/3 |
| holdout-02 | 50k | completed | stop | 66.85 | completed | stop | 16.53 | 0.000 pp | 1 | 3/3 |
| holdout-02 | 55k | completed | board_action|quality-increase-one|mid | 105.79 | completed | board_action|quality-increase-one|mid | 32.10 | 0.000 pp | 1 | 3/3 |
| holdout-02 | 60k | completed | board_action|quality-increase-one|mid | 102.58 | completed | board_action|quality-increase-one|mid | 37.41 | 0.000 pp | 1 | 3/3 |
| holdout-03 | 50k | completed | board_action|red-trait-all|mid | 136.05 | completed | board_action|red-trait-all|mid | 39.92 | 0.000 pp | 0.8333333333333334 | 2/3 |
| holdout-03 | 55k | completed | board_action|green-quality-all|mid | 170.82 | completed | board_action|green-quality-all|mid | 58.09 | 0.000 pp | 1 | 3/3 |
| holdout-03 | 60k | completed | board_action|green-quality-all|mid | 145.69 | completed | board_action|green-quality-all|mid | 52.89 | 0.000 pp | 0.8333333333333334 | 2/3 |
| holdout-04 | 50k | completed | board_action|red-quality-last|mid | 210.45 | timeout | — | 60.13 | — | — | — |
| holdout-04 | 55k | completed | board_action|red-quality-last|mid | 173.26 | timeout | — | 60.21 | — | — | — |
| holdout-04 | 60k | completed | board_action|red-quality-last|mid | 128.51 | completed | board_action|red-quality-last|mid | 54.64 | 0.000 pp | 1 | 3/3 |
| holdout-05 | 50k | completed | board_action|red-quality-random|mid | 192.36 | timeout | — | 60.18 | — | — | — |
| holdout-05 | 55k | completed | board_action|red-quality-random|mid | 201.17 | timeout | — | 60.18 | — | — | — |
| holdout-05 | 60k | completed | board_action|red-quality-random|core | 134.32 | completed | board_action|red-quality-random|mid | 48.62 | 1.063 pp | 0.9285714285714286 | 3/3 |
| holdout-06 | 50k | completed | board_action|quality-redistribution|mid | 256.59 | timeout | — | 60.18 | — | — | — |
| holdout-06 | 55k | completed | board_action|quality-redistribution|mid | 280.59 | timeout | — | 60.18 | — | — | — |
| holdout-06 | 60k | completed | board_action|quality-redistribution|mid | 239.85 | timeout | — | 60.24 | — | — | — |
| holdout-07 | 50k | completed | board_action|blue-trait-all|mid | 189.55 | timeout | — | 60.20 | — | — | — |
| holdout-07 | 55k | completed | board_action|blue-trait-all|mid | 175.78 | timeout | — | 60.20 | — | — | — |
| holdout-07 | 60k | completed | board_action|blue-trait-all|mid | 127.34 | completed | board_action|blue-trait-all|mid | 51.10 | 0.000 pp | 1 | 3/3 |
| holdout-08 | 50k | completed | board_action|red-quality-all|core | 144.00 | completed | board_action|red-quality-all|core | 58.84 | 0.000 pp | 1 | 3/3 |
| holdout-08 | 55k | completed | board_action|red-quality-all|core | 122.73 | completed | board_action|red-quality-all|core | 45.85 | 0.000 pp | 0.9285714285714286 | 3/3 |
| holdout-08 | 60k | completed | board_action|red-quality-all|core | 73.06 | completed | board_action|red-quality-all|core | 27.98 | 0.000 pp | 1 | 3/3 |

## Policy quality

Among the **15 completed oracle/candidate pairs**, 14 agreed on the root action and one disagreed.

- Agreement among completed pairs: **14/15**
- 50k: **4/4** completed pairs agree
- 55k: **3/3** completed pairs agree
- 60k: **7/8** completed pairs agree
- Canonical: **2/2** completed pairs agree
- One-step holdouts: **8/8** completed pairs agree
- Two-step holdouts: **4/5** completed pairs agree
- Stop/menu reversals among completed pairs: **0**
- Action-family disagreements among completed pairs: **0** (the sole disagreement was Core vs Mid within the quality family)
- Mean oracle regret using the frozen 27-case denominator: **0.0394 pp**
- Maximum observed oracle regret: **1.0626 pp**
- Median Kendall τ among completed pairs: **1.0000**
- Median top-3 overlap: **3/3**

The frozen mean-regret check passes only because missing timed-out comparisons contribute no observed regret under the pre-frozen evaluator. Missing oracle/candidate comparisons are not treated as policy agreements; the separate completeness/root-agreement checks fail.

## Runtime

Oracle runtime (27 completed):
- min **66.85s**
- median **170.82s**
- P90 **256.59s**
- max **305.49s**
- timeouts **0**

Candidate runtime (15 completed):
- min **16.53s**
- median **51.10s**
- P90 **58.87s**
- max **59.26s**
- timeouts **12**

Timed-out candidate cases:
- `canonical-default-55000` (60.20s observed before termination)
- `holdout-01-50000` (60.17s observed before termination)
- `holdout-01-55000` (60.18s observed before termination)
- `holdout-04-50000` (60.13s observed before termination)
- `holdout-04-55000` (60.21s observed before termination)
- `holdout-05-50000` (60.18s observed before termination)
- `holdout-05-55000` (60.18s observed before termination)
- `holdout-06-50000` (60.18s observed before termination)
- `holdout-06-55000` (60.18s observed before termination)
- `holdout-06-60000` (60.24s observed before termination)
- `holdout-07-50000` (60.20s observed before termination)
- `holdout-07-55000` (60.20s observed before termination)

Runtime failures are distributed across 50k and 55k and several fixtures rather than being confined to one threshold.

## Memory

- Maximum completed oracle RSS: **5.71 GiB**
- Maximum completed candidate RSS: **2.50 GiB**
- No completed run exceeded the 6.0 GiB guard.

The frozen aggregate `memoryUnder6Gb` check is false because timed-out candidate records do not contain completed-run RSS. This is not evidence of an OOM; it is a consequence of the pre-frozen gate requiring a completed run for the memory predicate.

## Threshold-policy sensitivity

| Fixture | Oracle 50k → 55k → 60k | Candidate 50k → 55k → 60k |
|---|---|---|
| canonical-default | board_action|red-quality-all|core → board_action|red-quality-all|core → board_action|red-quality-all|core | board_action|red-quality-all|core → [timeout] → board_action|red-quality-all|core |
| holdout-01 | board_action|blue-quality-all|support → board_action|blue-quality-all|support → board_action|blue-quality-all|support | [timeout] → [timeout] → board_action|blue-quality-all|support |
| holdout-02 | stop → board_action|quality-increase-one|mid → board_action|quality-increase-one|mid | stop → board_action|quality-increase-one|mid → board_action|quality-increase-one|mid |
| holdout-03 | board_action|red-trait-all|mid → board_action|green-quality-all|mid → board_action|green-quality-all|mid | board_action|red-trait-all|mid → board_action|green-quality-all|mid → board_action|green-quality-all|mid |
| holdout-04 | board_action|red-quality-last|mid → board_action|red-quality-last|mid → board_action|red-quality-last|mid | [timeout] → [timeout] → board_action|red-quality-last|mid |
| holdout-05 | board_action|red-quality-random|mid → board_action|red-quality-random|mid → board_action|red-quality-random|core | [timeout] → [timeout] → board_action|red-quality-random|mid |
| holdout-06 | board_action|quality-redistribution|mid → board_action|quality-redistribution|mid → board_action|quality-redistribution|mid | [timeout] → [timeout] → [timeout] |
| holdout-07 | board_action|blue-trait-all|mid → board_action|blue-trait-all|mid → board_action|blue-trait-all|mid | [timeout] → [timeout] → board_action|blue-trait-all|mid |
| holdout-08 | board_action|red-quality-all|core → board_action|red-quality-all|core → board_action|red-quality-all|core | board_action|red-quality-all|core → board_action|red-quality-all|core → board_action|red-quality-all|core |

All nine oracle threshold triplets satisfy target-probability monotonicity. Complete candidate triplets for `holdout-02`, `holdout-03`, and `holdout-08` also satisfy monotonicity. The frozen candidate monotonicity gate cannot validate the remaining fixtures because at least one threshold timed out.

## Target-kernel / state-dependent work

The exact-kernel diagnostics confirm that runtime variation is strongly state- and threshold-dependent rather than a single constant multiplier. The table below reports total target-kernel scenario checks and combinatorial target-search time for each completed oracle/candidate. Timed-out candidates intentionally have no completed-run kernel summary.

| Case | Oracle checks (B) | Oracle kernel s | Candidate checks (B) | Candidate kernel s |
|---|---:|---:|---:|---:|
| canonical-default-50k | 20.46 | 143.5 | 6.95 | 45.8 |
| canonical-default-55k | 25.98 | 158.4 | — | — |
| canonical-default-60k | 20.63 | 115.7 | 8.46 | 46.4 |
| holdout-01-50k | 38.01 | 256.3 | — | — |
| holdout-01-55k | 29.69 | 181.7 | — | — |
| holdout-01-60k | 16.50 | 108.0 | 7.01 | 42.8 |
| holdout-02-50k | 5.75 | 46.0 | 1.25 | 9.7 |
| holdout-02-55k | 12.53 | 84.6 | 3.72 | 24.5 |
| holdout-02-60k | 14.48 | 81.8 | 5.11 | 30.2 |
| holdout-03-50k | 15.19 | 103.4 | 4.16 | 29.6 |
| holdout-03-55k | 22.96 | 136.8 | 7.81 | 47.2 |
| holdout-03-60k | 19.09 | 107.8 | 7.39 | 42.3 |
| holdout-04-50k | 24.35 | 167.7 | — | — |
| holdout-04-55k | 25.85 | 134.6 | — | — |
| holdout-04-60k | 16.29 | 86.8 | 7.21 | 38.0 |
| holdout-05-50k | 19.46 | 142.6 | — | — |
| holdout-05-55000 | 23.34 | 153.4 | — | — |
| holdout-05-60000 | 18.37 | 92.3 | 7.52 | 36.0 |
| holdout-06-50000 | 27.58 | 197.2 | — | — |
| holdout-06-55000 | 33.39 | 219.1 | — | — |
| holdout-06-60000 | 26.75 | 181.8 | — | — |
| holdout-07-50000 | 23.46 | 150.6 | — | — |
| holdout-07-55000 | 25.48 | 136.7 | — | — |
| holdout-07-60000 | 17.63 | 88.2 | 7.62 | 37.1 |
| holdout-08-50000 | 21.19 | 114.1 | 8.63 | 47.8 |
| holdout-08-55000 | 17.68 | 91.8 | 7.25 | 35.1 |
| holdout-08-60000 | 9.16 | 45.0 | 3.86 | 18.8 |

The heaviest oracle was `holdout-01 @ 50k` at 38.01 billion scenario checks; the lightest was `holdout-02 @ 50k` at 5.75 billion. The candidate reduces work substantially when it completes, but the 60-second failures span several fixtures and both 50k/55k targets, so there is no single threshold-only failure cluster.

Full candidate-count, branch, pair/triple, suffix-bound, cache, preparation-time, DP/search, transition, and menu diagnostics remain preserved in the raw GitHub Actions case artifacts from run `31890281254`. The committed aggregate retains every field needed to reproduce the Markdown summary tables.

## Failure classification

**Outcome B. Primary classification: C — policy robustness failure.**  
**Also observed: B — candidate runtime robustness failure.**

The policy failure is decisive even if runtime were subsequently improved: the completed `holdout-05 @ 60k` case exceeds both the frozen near-tie gap and regret allowances. Therefore a pure performance package would not be sufficient to validate this exact approximation policy.

## Adversarial check

- Current main was inspected and the handoff SHA was still HEAD.
- Corpus remained exactly 9 frozen states × 3 fixed thresholds.
- All eight M5D holdouts were retained.
- Canonical BoardStateID and all holdout IDs reconstructed exactly.
- Objective remained direct `P(final score >= targetScore)`.
- Free roster/title target semantics and committed stochastic model were unchanged.
- Oracle remained current/no-widening t=3.
- Candidate remained aggressive 4→2→1 + Wide 12→8→4.
- Root/current-menu fidelity remained full.
- Production remained capped at t<=2.
- No threshold, fixture, timeout, gate, policy schedule, scenario count, or target-kernel algorithm was changed after measurement.
- No stop/menu disagreement was waived.
- Timed-out cases were not counted as agreements.
- No t=4 or expected-score t=8 work was started.

## Next bounded package

Do **not** advance to t=4 and do not expose target t=3 in production.

The next package should be a **separately frozen target-t=3 approximation recalibration/design package** using the preserved M5G corpus as holdout evidence and retaining a strict runtime requirement. Its objective should be to address the demonstrated decision-fidelity failure without modifying M5G’s recorded result. Runtime robustness must remain an explicit acceptance constraint because the current policy also timed out in 12/27 cases.

M5G itself remains closed as **Outcome B**; the frozen policy is not robustly validated.
