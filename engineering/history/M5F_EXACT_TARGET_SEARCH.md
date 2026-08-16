# M5F — Exact Target-Search Kernel Acceleration

## Status

**Outcome A — frozen exact-kernel feasibility gate passed.**

Exact target-search acceleration is sufficient for the already-frozen M5C-aggressive + M5D-Wide target-probability `t=3` candidate to complete under the required 60-second ceiling on the canonical M5F state while selecting the same root action as the optimized current-fidelity oracle.

This does **not** change production behavior. Production remains capped at two modeled token spends, M5C aggressive and M5D Wide remain engineering-only/off by default, and no `t=3` target mode is exposed in the UI.

## Branch and frozen experiment

```text
M5F_BASE_SHA          = b5b9beae74138db46252eadaaa8d024bb7c29931
benchmarked HEAD SHA  = 72dc7d0bfb26cddfa58fb78e99f130767946029b
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

The performance gates were frozen before optimization:

```text
optimized aggressive-only runtime / same-runner baseline aggressive-only runtime <= 0.80
Wide + aggressive t=3 candidate runtime < 60 seconds
current-fidelity t=3 oracle runtime < 600 seconds
current-fidelity oracle max RSS < 6.0 GB
candidate root winner == oracle root winner
```

No target value, scenario count, optimizer fidelity, continuation schedule, widening schedule, timeout, or success criterion was changed after measurement began.

## Profiling evidence

An engineering-only Node 22 profile of the unchanged M5E traversal measured the dominant repeated exact work before optimization:

```text
searches                               1,738,200
unique full prepared-group tuples      1,738,200
reused full prepared-group tuples              0

Core–Mid pair identities
  unique                                 419,328
  reused                               1,318,872
Mid–Support pair identities
  unique                                 483,520
  reused                               1,254,680
Core–Support pair identities
  unique                                 502,704
  reused                               1,235,496

pair branches                         299,090,699
third candidates / triples scanned    296,256,334
scenario checks                    17,404,506,588
surviving pair-sample builds           20,044,527
combinatorial target search               114.85 s
```

The profile rejected generic full-search memoization: every prepared `(group1, group2, group3)` tuple was unique. It supported two narrower optimizations: prepared first–second pair reuse and exact bounds over the remaining third-group suffix.

## Exact optimizations

### 1. Cached exact third-group suffix/block bounds

`targetSearch.ts` now lazily prepares exact summaries for remaining third-group candidate blocks/suffixes by prepared-group identity. The summaries contain optimistic expected-score and per-scenario sample maxima. After scanning a canonical third candidate, the kernel can prove that a remaining suffix cannot beat the incumbent and skip it.

The bound is exact. It does not truncate probabilities, approximate dominance, alter the target, or change candidate eligibility. Canonical candidate order remains the semantic order, so an exact `(hits, expected)` tie still resolves to the same first encountered payload triple.

### 2. Reuse of exact prepared first–second pair samples

The measured Core–Mid prepared-pair recurrence is reused through weak identity caches. Pair sample sums are built lazily only for surviving branches and are retained only after a prepared pair identity recurs. This avoids rebuilding the same exact scenario-wise pair vectors across searches while preserving the existing pair bound and target semantics.

Caches are bounded and identity-based rather than serialized by Dota state. Pair-cache accounting is capped at approximately 256 MiB before reset; suffix-summary accounting is capped at approximately 128 MiB. Weak references keep lifetime tied to prepared-group objects.

### 3. Hot-loop allocation/diagnostic reduction

The optimized path reuses typed scratch buffers and aggregates engineering counters locally before flushing them. Winning samples are still materialized only for the selected triple. No Dota role/team/title policy moved into the generic kernel.

### Rejected hypotheses

- **Full prepared-group-triple memoization:** rejected because the diagnostic corpus had zero full tuple reuse.
- **Approximate or target-specific pair frontiers:** not used; M5F permits exact optimization only.
- **Traversal reordering:** not needed; canonical order was retained, avoiding any new tie-reconciliation path.
- **Workers/parallel search:** out of scope and not used.

## Exact equivalence evidence

The pre-optimization kernel is retained as a reference path for tests. Reference-versus-optimized checks cover returned/undefined status, hit count, probability, expected-score tie-break value, selected payload triple, returned sample vector, and incumbent semantics.

M5F added deterministic coverage for:

- empty and single-candidate groups;
- all-hit/no-hit and exact target-boundary cases;
- equal-hit candidates with different expected scores;
- equal-hit/equal-expected canonical first-seen ties;
- incumbents below/equal/above the optimum;
- incumbent expected values around the existing `1e-12` epsilon boundary;
- uneven candidate counts and loose-bound adversarial cases;
- cases designed for suffix-bound pruning;
- pair-cache recurrence;
- 600 deterministic adversarial generated cases;
- exhaustive small integer sample-space comparison over 4,096 group configurations across targets `0…6`;
- an additional 900,000 randomized reference comparisons during development.

The authoritative preflight passed all **163** repository tests, including the new M5F equivalence tests, `t<=2` ranked-policy regressions, direct target-probability roster/title semantics, expected-score regressions, all-20-operation menu tests, and the production-horizon guard.

## Authoritative Node 22 experiment

Runner:

```text
Node       v22.23.2
Platform   linux x64
OS         Ubuntu 24.04 runner / Linux 6.17.0-1022-azure
CPU        AMD EPYC 9V74 80-Core Processor
Logical    4 CPUs
Memory     16.77 GB
Base       b5b9beae74138db46252eadaaa8d024bb7c29931
Optimized  72dc7d0bfb26cddfa58fb78e99f130767946029b
```

The baseline and optimized aggressive-only controls ran sequentially in isolated Node 22 processes on the **same GitHub Actions runner**. The baseline came from a clean worktree at `M5F_BASE_SHA`. Profiler/shadow-diagnostic overhead was excluded from authoritative timing.

| Case | Result | Runtime | Root target utility | Root action |
|---|---|---:|---:|---|
| baseline `t3-aggressive-only` | completed | **99.69 s** | 0.947796 | Core → red quality reroll |
| optimized `t3-aggressive-only` | completed | **78.18 s** | 0.947796 | Core → red quality reroll |
| optimized `t3-current-oracle` | completed | **167.00 s** | 0.935461 | Core → red quality reroll |
| optimized `t3-aggressive-wide` | completed | **58.42 s** | 0.946939 | Core → red quality reroll |

Same-runner aggressive speed ratio:

```text
78.1757 / 99.6925 = 0.78417
```

That is a **21.58% wall-clock reduction**, passing the frozen `<= 0.80` material-speedup gate. The selected candidate finished about **1.58 seconds inside** the strict 60-second ceiling.

## Exact oracle ranking

The optimized current-fidelity oracle ranked the entire current menu:

| Rank | Action | Target utility | Expected-score diagnostic |
|---:|---|---:|---:|
| 1 | Core → red quality reroll | 0.935461 | 57,912.36 |
| 2 | Mid → red quality reroll | 0.831753 | 52,884.75 |
| 3 | Support → blue trait reroll | 0.810882 | 53,919.37 |
| 4 | Mid → blue trait reroll | 0.788579 | 53,263.97 |
| 5 | Menu reroll | 0.740834 | 52,167.68 |
| 6 | Core → green stat reroll | 0.579539 | 49,731.73 |
| 7 | Mid → green stat reroll | 0.531696 | 49,313.11 |
| 8 | Support → green stat reroll | 0.487601 | 48,506.37 |
| 9 | Stop | 0.229167 | 52,167.68 |

Oracle top-two probability gap: `0.103708`, or **10.371 percentage points**.

## Candidate fidelity versus oracle

The frozen aggressive+Wide candidate selected the exact same root action. Evaluating that selected action under the oracle ranking gives:

```text
same root winner             yes
oracle regret                 0.000000 probability / 0.000 pp
Kendall rank correlation      1.000
top-3 overlap                 3 / 3
stop/menu order reversed      no
action-family agreement       yes (quality)
runtime ratio vs oracle       0.3498
```

No recommendation disagreement was waived as a near tie.

## Target-search diagnostics before/after

Same-runner aggressive-only control:

| Metric | Base M5E kernel | Optimized M5F kernel | Change |
|---|---:|---:|---:|
| Wall time | 99.69 s | 78.18 s | **-21.58%** |
| Combinatorial target search | 86.35 s | 61.79 s | **-28.45%** |
| Scenario checks | 17.405 B | 13.286 B | **-23.67%** |
| Pair branches considered | 299.091 M | 299.091 M | unchanged |
| Third candidates / triples scanned | 296.256 M | 35.784 M | **-87.92%** |
| Surviving pair-sample builds | 20.045 M | 5.333 M | **-73.39%** |

Optimized aggressive-only M5F-specific counters:

```text
suffix-bound calls                  25,199,165
suffix-bound prunes                 20,044,359
third candidates skipped           260,471,909
pair-group cache hits                1,129,608
pair-group cache misses                440,413
pair-sample cache hits              81,914,583
pair-sample cache misses           217,176,116
pair-sample cache builds             2,430,984
pair-cache resets                            3
pair-cache estimated bytes         253,266,232
suffix-cache hits                    1,685,336
suffix-cache misses                     52,864
suffix-cache builds                     52,864
suffix-cache estimated bytes        89,481,648
pair-sample build time                   0.54 s
suffix-summary build time                0.69 s
```

The pair-branch count intentionally does not change: M5F does not add approximate pair pruning. The major win is exact early proof that most remaining third candidates cannot beat the incumbent, plus avoiding repeated pair-vector construction.

### Optimized exact oracle kernel

```text
searches                            3,321,784
pair branches                     590,020,671
triples scanned                    66,426,910
scenario checks                    25.979 B
surviving pair-sample builds       11,381,586
suffix-bound calls                 48,095,502
suffix-bound prunes                39,169,415
third candidates skipped          510,917,219
combinatorial target search           129.88 s
transition generation                   0.37 s
```

The bottleneck remains target combinatorial search, but exact suffix/pair reuse removes enough of it to satisfy the frozen feasibility package.

## DP/search integrity diagnostics

The optimized current-fidelity oracle remained full at the root and used the unchanged exact/current continuation policy:

```text
modeled horizon                    3
target scalar states               415,223
expected scalar states                  55
terminal scoring calls             415,278
V calls                          1,689,749
V cache hits                         5,775
V cache misses                       6,611
Q calls                                  1
action calls                       132,223
unique states by depth
  depth 0                          415,223
  depth 1                            6,563
  depth 2                               48
transition evaluations
  depth 1                          393,780
  depth 2                            2,880
  depth 3                                9
menu operator calls                  6,611
explicit menus scanned                   0
```

The candidate used the unchanged M5C aggressive schedule and M5D Wide schedule. M5D remained bypassed at the root/current menu, and all 20 future operation identities remained represented by the exact menu operator.

## Memory

| Case | Max RSS |
|---|---:|
| baseline aggressive-only | 2.15 GB |
| optimized aggressive-only | 2.94 GB |
| optimized current-fidelity oracle | **4.72 GB** |
| optimized aggressive+Wide candidate | 2.30 GB |

The optimized oracle stayed below the frozen 6.0 GB guard. No completed case exhibited OOM or pathological cache growth. The memory increase versus the base aggressive-only control is the intended bounded trade for exact reuse.

## Frozen gate result

**Outcome A.** Every frozen M5F gate check passed:

- preflight typecheck, generated-output verification, and full tests passed;
- generic reference-vs-optimized kernel equivalence passed;
- Dota-facing target roster/title semantics remained direct target-probability optimization;
- complete `t<=2` target regressions remained green;
- expected-score behavior remained unchanged;
- production horizon remained 2;
- M5C `4→2→1` and M5D Wide `12→8→4` remained unchanged and engineering-only;
- same-runner optimized aggressive-only ratio was `0.78417 <= 0.80`;
- optimized exact/current-fidelity oracle completed in `167.00 s < 600 s`;
- oracle max RSS was `4.72 GB < 6.0 GB`;
- aggressive+Wide candidate completed in `58.42 s < 60 s`;
- candidate selected the same root winner as the oracle;
- stop and menu-reroll semantics remained normal;
- all 20 future operation identities remained represented;
- optimized caches remained bounded;
- no optimized execution case errored.

## Adversarial check

- Target remained exactly `55,000`: **yes**.
- Terminal roster/title selection still maximized target probability directly: **yes**.
- Optimizer iterations/scenario sample bank changed: **no**.
- Any dominance/bound became approximate: **no**; the new suffix bound is an exact optimistic bound.
- Traversal reordering changed canonical tie behavior: **no**; canonical order was retained and exact tie tests pass.
- Generic kernel stayed Dota-agnostic: **yes**.
- Same-runner baseline was exact `M5F_BASE_SHA`: **yes**.
- Baseline and optimized controls used the same runner instance: **yes**.
- Profiler/shadow-diagnostic overhead entered authoritative timing: **no**.
- Oracle was current fidelity with no widening: **yes**.
- M5C `4→2→1` and M5D Wide `12→8→4` changed: **no**.
- Root/current-menu fidelity remained full: **yes**.
- Candidate actually completed below 60 seconds: **yes, 58.42 s**.
- Candidate and oracle selected the same root action: **yes**.
- Stop/menu semantics changed: **no**.
- All 20 future operations remained represented: **yes**.
- New caches were unbounded: **no**; explicit byte guards and weak identity ownership are used.
- Expected-score behavior changed: **no**; regressions pass and target mode still uses expected score only under existing tie semantics.
- Gates/target/timeouts/schedules were changed after results: **no**.
- Does this result establish broad target-state robustness or production `t=3` readiness: **no**.

## What M5F justifies

M5F establishes that exact target-search kernel acceleration is strong enough for the **already-selected** M5C aggressive + M5D Wide `t=3` policy to satisfy the frozen runtime and root-fidelity gates on this canonical target/state. The improvement comes from exact structural reuse and stronger exact bounds, not a new approximation.

The result is intentionally narrow. It does not establish robustness across different target thresholds, board states, menus, tournament states, or sample banks. It does not authorize target `t=4`, expected-score `t=8`, a production-horizon increase, or UI exposure of `t=3`.

Per the roadmap, the next step after merging M5F would be a **separately frozen robustness package** over multiple target thresholds and board/menu states before considering any production target-`t=3` change.
