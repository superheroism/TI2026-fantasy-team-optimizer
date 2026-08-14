# M5E — Target-Probability `t=3` Feasibility

## Status

**Measurement pending.** This package is a frozen feasibility experiment. It does not change production search depth or enable an approximation by default.

## Mission

Determine whether the already-selected M5C aggressive continuation policy plus M5D Wide progressive action widening makes three-token target-probability search computationally practical while preserving the exact current-fidelity root decision.

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

No other target threshold, widening schedule, continuation schedule, or target-specific action filter may be introduced in M5E after measurement begins.

The phrase **material runtime improvement** is frozen before measurement as:

```text
candidate runtime / same-runner oracle runtime <= 0.80
```

That is, the candidate must be at least 20% faster than the current-fidelity oracle in addition to completing under 60 seconds.

## Frozen cases

| ID | Horizon | Continuation fidelity | Action widening | Timeout | Purpose |
|---|---:|---|---|---:|---|
| `t2-current` | 2 | current | none | 120 s | Baseline target-policy sanity |
| `t2-aggressive-wide` | 2 | aggressive supplied | Wide supplied | 120 s | Prove engineering options are structurally ignored at `t<=2` |
| `t3-current-oracle` | 3 | current | none | 600 s | Exact/current-fidelity reference policy |
| `t3-aggressive-only` | 3 | aggressive | none | 600 s | Diagnostic isolation of M5C continuation compression |
| `t3-aggressive-wide` | 3 | aggressive | Wide | 60 s | Selected feasibility candidate |

Each case runs in a separate Node process with `--expose-gc` and pre-run GC. The authoritative batch runs sequentially in one GitHub Actions job on Node 22 so wall-time comparisons use the same runner class. Profiler overhead is excluded.

## Objective integrity

Target utility remains `P(final score >= 55,000)` throughout terminal roster/title optimization, continuation recursion, current-menu comparison, stop, and menu reroll. Expected score remains a secondary diagnostic/tie-breaker only where the existing exact target-search semantics already use it.

The generic `targetSearch.ts` kernel is not modified by the initial M5E package.

## Outcome A gate

Outcome A requires every frozen condition below:

1. preflight typecheck, generated-output verification, and full tests pass;
2. complete target ranked-table equivalence between the two `t=2` cases;
3. M5C/M5D options resolve to current/no-widening diagnostics at `t=2`;
4. production remains capped at two modeled token spends;
5. every completed case uses target `55,000` and the frozen default menu;
6. the `t=3` oracle is current fidelity with no widening and completes within 600 seconds;
7. the candidate is exactly M5C aggressive `4→2→1` plus M5D Wide `12→8→4`;
8. candidate and oracle choose the same root action;
9. candidate completes in less than 60 seconds;
10. candidate/oracle runtime is at most `0.80` on the same runner;
11. candidate completes without pathological memory failure;
12. stop and menu reroll remain represented normally;
13. all 20 future operation identities remain represented in the exact menu operator.

Any failed condition produces Outcome B. Winner disagreement is not waived as a near tie.

## Required diagnostics

The authoritative JSON report records the complete current-menu ranking, target utility, expected-score diagnostic, stop/menu values, runtime and memory, optimizer/value-function diagnostics, transition diagnostics, M5C/M5D reports, raw-scenario diagnostics, and the accumulated target-search kernel diagnostics.

For candidate versus oracle it also records probability regret, percentage-point regret, oracle top-two gap, Kendall rank correlation, top-3 overlap, stop/menu reversal status, action-family agreement, and same-runner runtime ratio.

## Production isolation

Normal application behavior is unchanged:

```text
production modeled horizon = max 2
M5C aggressive             = engineering-only, off by default
M5D Wide                    = engineering-only, off by default
```

M5E does not expose `t=3` target mode in the UI and does not change target defaults, menus, token mechanics, stochastic scoring fidelity, or the exact menu operator.

## Result

Pending authoritative GitHub Actions measurement.
