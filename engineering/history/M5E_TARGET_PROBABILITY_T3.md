# M5E — Target-Probability `t=3` Feasibility

## Status

**Outcome B — candidate runtime infeasibility.**

The frozen M5C-aggressive + M5D-Wide target-probability `t=3` candidate did not complete within the required 60-second ceiling, either before or after the one permitted bounded exact optimization. M5E therefore does not establish target-probability `t=3` feasibility under the selected policy.

This is a runtime result, not an observed recommendation-fidelity failure: the candidate was terminated before it produced a ranked root table.

## Frozen experiment

```text
objective              = target_probability
targetScore            = 55,000
board                   = default benchmark board
menu                    = green-stat-all
                          red-quality-all
                          blue-trait-all
tokensRemaining         = 10
menuRerollAvailable     = true
production horizon      = 2
experiment horizon      = 3
M5C aggressive          = 4 → 2 → 1
M5D Wide                = 12 → 8 → 4
```

The material-runtime gate was frozen before measurement as:

```text
candidate runtime / same-runner oracle runtime <= 0.80
```

No target, timeout, continuation schedule, widening schedule, target-specific filter, or success gate was changed after measurement began.

## Frozen cases

| ID | Horizon | Continuation fidelity | Action widening | Timeout |
|---|---:|---|---|---:|
| `t2-current` | 2 | current | none | 120 s |
| `t2-aggressive-wide` | 2 | aggressive supplied | Wide supplied | 120 s |
| `t3-current-oracle` | 3 | current | none | 600 s |
| `t3-aggressive-only` | 3 | aggressive | none | 600 s |
| `t3-aggressive-wide` | 3 | aggressive | Wide | 60 s |

Each case ran in a separate Node 22 process with `--expose-gc` and pre-run GC. The authoritative cases ran sequentially in one GitHub Actions job on the same `ubuntu-latest` runner class, with no profiler overhead.

## First authoritative run

The initial infrastructure-only run established the failure mode before any optimization:

| Case | Result | Runtime | Root action |
|---|---|---:|---|
| `t3-current-oracle` | completed | 263.3 s | Core → red quality reroll |
| `t3-aggressive-only` | completed | 128.9 s | Core → red quality reroll |
| `t3-aggressive-wide` | **timeout** | >60 s | unavailable |

The aggressive-only diagnostic preserved the oracle rank order exactly: Kendall `τ = 1`, top-3 overlap `3/3`, no stop/menu reversal, and zero oracle regret. Its runtime ratio versus the oracle was about `0.490`.

The bottleneck was clearly target terminal search rather than transition generation. Aggressive-only spent about 111.1 seconds in combinatorial target search, performing about 17.4 billion scenario checks, while transition generation consumed only about 0.19 seconds. Its target adapter also showed zero whole-board cache hits while the DP had already memoized terminal utility by compact board ID.

## Bounded exact optimization

M5E used the one optimization package permitted by the frozen plan:

- added an exact compact target-terminal scorer;
- cached descriptive banners by role-local `BannerStateID` rather than rebuilding all three banners for every terminal board;
- bypassed the redundant target adapter whole-board choice cache only when the optimizer's canonical `BoardStateID` memo already owns whole-board identity;
- kept prepared-role and lower-level target-search caches active;
- left the generic `targetSearch.ts` kernel unchanged;
- left target roster/title optimization, target utility, stop, menu reroll, M5C, M5D, and expected-score behavior unchanged.

A deterministic regression test compares compact target scoring against the existing descriptive target scorer across reachable one-action compact states using the committed statistical/title models.

The optimization materially reduced descriptive-state churn and memory, but not the dominant combinatorial workload. On the final oracle run:

```text
descriptive terminal-board materializations = 0
target terminal states                     = 415,223
target banner materializations             = 31,009
target banner cache hits                    = 1,214,657
```

## Final authoritative rerun

Runner:

```text
Node       v22.23.2
Platform   linux x64
CPU        AMD EPYC 7763 64-Core Processor
Logical    4 CPUs
Memory     16.77 GB
Commit     6cf52c757aaaa2226da439e3d8cb9c69218d005e
```

Preflight typecheck, committed-generated-output verification, and the full test suite passed before timing.

| Case | Result | Runtime | Root target utility | Root action |
|---|---|---:|---:|---|
| `t2-current` | completed | 5.07 s | 0.866000 | Core → red quality reroll |
| `t2-aggressive-wide` | completed | ~5.22 s | 0.866000 | Core → red quality reroll |
| `t3-current-oracle` | completed | **255.89 s** | 0.935461 | Core → red quality reroll |
| `t3-aggressive-only` | completed | **126.92 s** | 0.947796 | Core → red quality reroll |
| `t3-aggressive-wide` | **timeout** | **60.15 s elapsed** | unavailable | unavailable |

The two `t=2` ranked action tables are exactly equal within the existing numerical tolerance, and diagnostics confirm the supplied M5C/M5D options are structurally ignored at `t<=2`.

### Oracle ranking

The exact/current-fidelity oracle ranked the current menu:

| Rank | Action | Target utility |
|---:|---|---:|
| 1 | Core → red quality reroll | 0.935461 |
| 2 | Mid → red quality reroll | 0.831753 |
| 3 | Support → blue trait reroll | 0.810882 |
| 4 | Mid → blue trait reroll | 0.788579 |
| 5 | Menu reroll | 0.740834 |
| 6 | Core → green stat reroll | 0.579539 |
| 7 | Mid → green stat reroll | 0.531696 |
| 8 | Support → green stat reroll | 0.487601 |
| 9 | Stop | 0.229167 |

Oracle top-two gap: `0.103708`, or **10.371 percentage points**.

### Aggressive-only diagnostic

Against the oracle:

```text
same winner                 yes
oracle regret               0.000000 probability / 0.000 pp
Kendall rank correlation    1.000
top-3 overlap               3 / 3
stop/menu reversal          no
action-family agreement     yes
runtime ratio vs oracle     0.496
```

These diagnostics support the previously selected M5C aggressive continuation policy in this state, but they do not substitute for the required Wide+aggressive candidate result.

### Target-search hot path

Final current-fidelity oracle:

```text
scenario checks                 34.176 billion
pair branches considered        590.021 million
triples considered              577.344 million
surviving pair-sample builds     39.170 million
candidate preparation             7.15 s
combinatorial target search     222.88 s
transition generation             0.25 s
```

Final aggressive-only diagnostic:

```text
scenario checks                 17.405 billion
pair branches considered        299.091 million
triples considered              296.256 million
surviving pair-sample builds     20.045 million
candidate preparation             2.74 s
combinatorial target search     110.43 s
transition generation             0.21 s
```

The remaining cost is therefore the exact target-probability combinatorial kernel, not transition mechanics or descriptive-board conversion.

### Memory

The exact compact target boundary reduced terminal representation overhead without changing the search result. Final measured end/max-RSS values were approximately:

| Case | End heap | End RSS | Max RSS |
|---|---:|---:|---:|
| `t3-current-oracle` | 1.73 GB | 4.14 GB | 4.14 GB |
| `t3-aggressive-only` | 0.97 GB | 2.31 GB | 2.31 GB |

No completed case exhibited OOM behavior. Candidate memory cannot be classified because the worker was killed at its runtime ceiling before returning diagnostics.

## Frozen gate result

**Outcome B.** The following foundational conditions remained green:

- full preflight passed;
- exact `t<=2` target ranked-table equivalence passed;
- experimental policies remained disabled at `t<=2`;
- production horizon remained 2;
- target remained 55,000 and menu remained frozen;
- the current-fidelity oracle completed within 600 seconds;
- stop/menu semantics and all 20 exact future operation identities remained present in completed searches.

The selected candidate failed the decisive performance condition:

```text
Wide + aggressive t=3 did not complete in <60 seconds.
```

Because the candidate did not return, M5E cannot measure its root recommendation, oracle regret, Kendall correlation, top-3 overlap, memory, or operation-set diagnostics. Those are **unavailable**, not evidence of an accuracy or policy-integrity failure.

## Adversarial check

- Target remained exactly `55,000`: **yes**.
- Terminal roster/title selection optimized target probability directly: **yes**.
- Oracle was current fidelity with no widening: **yes**.
- M5C `4→2→1` and M5D Wide `12→8→4` were unchanged: **yes**.
- Root/current-menu fidelity remained full: **yes**.
- Candidate chose the same action as oracle: **not observable; candidate timed out**.
- Stop and menu reroll retained normal semantics: **yes in all completed cases; candidate output unavailable**.
- Exact menu operator retained all 20 future operations: **yes; unchanged implementation and present in completed diagnostics**.
- Timing comparison used one runner class with profiler overhead excluded: **yes**.
- The exact optimization changed expected-score behavior: **no; expected-score path was untouched and full regression tests passed**.
- Gates/timeouts were changed after observing results: **no**.
- Does this establish target `t=4`, multiple-threshold robustness, or production readiness: **no**.

## What M5E justifies

M5E shows that exact/current-fidelity target `t=3` is computable on the authoritative runner, and that M5C aggressive continuation alone roughly halves runtime while preserving the complete root ranking on this frozen state. It also identifies the target combinatorial search kernel as the dominant remaining cost.

It does **not** validate the selected Wide+aggressive policy at `t=3`, because that policy did not finish under the frozen feasibility ceiling. No further approximation or target-specific retuning is authorized by M5E. Any attempt to make target `t=3` production-practical would require a separately frozen milestone focused on the exact target-search hot path or a new approximation design and validation corpus.

Production remains capped at two modeled token spends. No `t=3` target mode is exposed in the UI.