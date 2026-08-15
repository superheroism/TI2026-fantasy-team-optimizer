# M6B — Expanded-Board t=2 Frontier Profiling & Exact Containment

**Status:** Outcome B — expanded `t=2` growth is predominantly intrinsic  
**Frozen base:** `a3505bbd25d7cac47d115452b924a2f3f8eda4ae`  
**Authoritative runtime:** GitHub Actions, Node 22/Linux, isolated child processes with `--expose-gc`

## Scope and invariants

M6B began only after M6A was merged. The current `main` HEAD at kickoff was frozen as the base SHA above.

No search or scoring semantics changed. In particular, M6B did not change expected-score or target-probability semantics, stochastic scenario fidelity, transition probabilities, stat legality, duplicate-stat rules, trait/quality mechanics, five-slot redistribution, menu probabilities, stop/menu-reroll behavior, free roster/title optimization, continuation schedules, progressive widening, deterministic tie-breaking, or target-search mathematics.

Production remains:

```text
layout = legacy_3
modeled horizon <= 2
```

M6B did not run target `t=3` or `t=4`, did not consume the M5H holdout, and did not introduce an approximation or worker parallelism.

## Baseline instrumentation

`benchmarks/m6b-expanded-frontier-baseline.json` records the complete required legacy/expanded matrix and exposes the frontier at several boundaries:

```text
stochastic transition paths
→ aggregated compact banner/board states
→ continuation states
→ terminal/scoring states
→ target role preparation
→ exact target kernel
```

The profile includes transition generation/aggregation, unique continuation and terminal states, V/Q/action calls and caches, terminal scoring time, target preparation/search counters, target pair/suffix cache behavior, and process memory.

## Frontier attribution

The expanded board increases structural work much faster than it increases the cost of encoding a state. The authoritative baseline produced:

| Workload | Expanded / legacy runtime | Terminal states | V calls | Aggregated transition paths |
|---|---:|---:|---:|---:|
| Stat-heavy `t=1` | 1.37× | 3.41× | 3.41× | 3.45× |
| Stat-heavy `t=2` | 2.72× | 2.54× | 1.89× | 6.31× |
| Quality-heavy `t=2` | 4.13× | 3.99× | 2.82× | 9.30× |
| Trait-heavy `t=2` | 3.14× | 2.86× | 2.07× | 6.88× |
| Global-quality `t=2` | 3.87× | 2.94× | 2.05× | 7.01× |
| Target-probability `t=2` | 3.03× | 2.72× | 1.94× | 6.52× |

The operation-family signal is clear. Quality-heavy is the largest relative frontier expansion in this matrix. Expanded quality-heavy generates 47,962 raw transition outcomes and aggregates them to 47,760; the corresponding legacy run generates 5,139 and aggregates to 5,138. Global quality similarly grows from 7,647 → 7,644 legacy outcomes to 53,911 → 53,552 expanded outcomes. Stat and trait workloads show essentially no transition-level duplicate collapse on these fixtures, so their growth is overwhelmingly new reachable state rather than duplicate stochastic paths.

Representative repeated-color stat geometry also expands immediately: the one-step stat-heavy workload goes from 67 to 231 aggregated transition outcomes overall, while the production-relevant `t=2` stat workload grows from 6,300 to 39,770.

## Convergence and transposition analysis

There is real convergence, but the existing engine already captures it at the semantics-safe boundaries.

- Compact transition enumeration aggregates by resulting banner ID before returning downstream work. In expanded quality-heavy it collapses 202 raw paths; global-quality collapses 359; target mode collapses 95.
- Terminal utility is memoized by canonical board state. Expanded target `t=2` receives 6,100 terminal-cache hits while evaluating 17,846 unique terminal boards.
- `V(B,t)` is keyed by canonical state plus depth. At `t=2`, there are relatively few nonterminal states at depth 1 (77 in expanded target), and only one additional V transposition hit in that target fixture. This shows that the dominant terminal frontier is made of genuinely distinct boards rather than ancestry-distinguished copies of the same continuation state.
- Fresh-menu action values intentionally bypass one-use action/transition wrappers, while compact banner mechanics still reuse the underlying banner-level transition cache. Restoring whole-board one-use caches would reintroduce the memory pressure removed in M5B without evidence of useful reuse.
- No descriptive `BoardState` is materialized in the compact expected/target terminal hot path; M6B therefore found no remaining `EngineState → BoardState → EngineState` churn to remove from these searches.

The measured raw-path/unique-state ratios do not reveal a missing broad transposition layer. The strongest convergence occurs where caches already exist: terminal scalar evaluation, role/banner scoring preparation, compact transition mechanics, and target-kernel pair/suffix summaries.

## Aggregation-boundary audit

The current ordering is already appropriately early for the material boundaries:

```text
operation
→ compact banner transition enumeration
→ canonical banner-state aggregation
→ EngineState construction using unchanged banner IDs
→ action expectation / V recursion
→ canonical terminal memoization
→ role-local scoring/target preparation
```

Moving aggregation earlier would either be identical to the existing banner aggregation or would cross a semantic boundary where board/menu/depth context still matters. M6B found no material downstream rescoring caused by root-action ancestry, wrapper-object identity, or descriptive-state identity.

## Banner-local reuse audit

Both terminal scorers already exploit the fact that most actions modify one role:

- expected-score preparation is cached by role-local banner ID;
- target banner materialization is cached by role-local banner ID;
- target prepared-role candidates are cached by banner mechanics, title prefix, and iteration count;
- `rankTeamsForRole` itself already has a banner-mechanics ranking cache.

The expanded target run records 385,296 prepared-role cache hits versus 43,392 misses, about a 90% hit rate. The 43,392 misses equal the necessary prefix-specific preparations for the unique role/banner states encountered; adding another adapter-level ranking cache would duplicate the existing `rankTeamsForRole` cache rather than remove structural work.

## Target-probability attribution

Target probability remains the most expensive absolute `t=2` workload.

| Metric | legacy_3 | expanded_5 | Expanded / legacy |
|---|---:|---:|---:|
| Optimizer runtime | 4.441 s | 13.441 s | 3.03× |
| Target scalar states | 6,563 | 17,862 | 2.72× |
| Scenario checks | 432,886,346 | 1,383,756,976 | 3.20× |
| Target scoring time | 4.156 s | 12.881 s | 3.10× |
| Candidate preparation | 0.304 s | 1.024 s | 3.37× |
| Exact target kernel | 2.568 s | 6.816 s | 2.65× |
| Pair-sample build time | 0.025 s | 0.063 s | 2.54× |
| Suffix-summary build time | 0.042 s | 0.129 s | 3.05× |

The expanded run performs 27,013,516 pair branches and 1,383,756,976 scenario checks. Pair-scenario checks alone account for 1,109,494,995 checks. This is primarily more exact search over more distinct terminal boards, not a per-board algorithmic regression.

The existing target-kernel caches are not thrashing. Expanded `t=2` records:

```text
pair-group cache:  77,632 hits / 63,107 misses
pair-sample cache: 3,532,432 hits / 23,481,084 misses
pair cache builds: 80,443
pair cache resets: 0
pair cache bytes:  ~34.3 MB (256 MiB limit)

suffix cache:      129,208 hits / 13,688 misses
suffix builds:     13,688
suffix resets:     0
```

Pair/suffix construction consumes only about 0.19 s combined, so increasing cache limits or replacing the cache policy would target a small share of runtime while exchanging memory for little measured work reduction.

## Exact optimization candidates rejected

### Earlier canonical-state aggregation

Rejected as redundant. Compact transitions already aggregate by resulting banner ID before EngineState construction, and terminal utility is memoized by canonical board ID.

### Narrower banner-level memoization

Rejected as redundant. Scoring, target materialization, target role preparation, ranking, and transition mechanics already use role/banner mechanics identities. The measured target prepared-role hit rate is already about 90%.

### Continuation-state transposition reuse

Rejected for `t=2`. The remaining depth-1 continuation frontier is small and already keyed canonically. Expanded target has only 77 unique depth-1 V states and one extra V cache hit; the large cost is at distinct terminal states.

### Larger/different target pair/suffix caches

Rejected. Neither cache resets, both are far below configured memory limits, and measured pair/suffix build time is small relative to exact kernel/scenario-check time.

### Descriptive-state churn removal

Rejected as already completed by earlier milestones. The profiled compact terminal paths report zero descriptive board materializations.

## Conclusion — Outcome B

M6B does **not** add another cache or alter exact search. The expanded `t=2` cost is predominantly intrinsic frontier growth under the present exact stochastic model:

1. repeated-color five-slot operations create substantially more legal next states;
2. most of those states remain distinct after existing exact transition aggregation;
3. existing terminal/banner/target caches already capture the meaningful convergence that does occur;
4. target probability then applies the unchanged exact target kernel to roughly 2.7× as many scalar board states and performs roughly 3.2× as many scenario checks.

A micro-optimization that leaves those structural counters unchanged would not satisfy the M6B purpose, and a larger cache would trade memory for work that the profile shows is not dominant.

## Next sequencing decision

The next package should be an **expanded-board-specific bounded approximation/calibration package for production-horizon `t=2`**. It should establish an exact expanded `t=2` oracle set, propose bounded frontier/fidelity reductions, and measure root ranking/regret against that oracle before any approximation is considered for production.

Do not reuse M5C/M5D/M5H calibration conclusions without fresh expanded-board validation. Do not resume target `t=3`, consume the M5H holdout, or begin target `t=4` until expanded-board `t=2` behavior has a controlled production envelope.

`benchmarks/m6b-expanded-frontier-post.json` is a same-semantics validation replication rather than an “optimized” benchmark: `optimizationSelected` is deliberately `null`. Its role is to verify semantic/structural stability after instrumentation and documentation, not to manufacture a speedup.
