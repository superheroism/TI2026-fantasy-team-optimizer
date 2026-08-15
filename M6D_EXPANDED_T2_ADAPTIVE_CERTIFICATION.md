# M6D — Expanded-Board t=2 Adaptive Exact Certification

**Status:** frozen; calibration pending  
**M6D_BASE_SHA:** `7757654ff91a4ca7a4f2fb7cad556620efc88140`

## Objective

Test whether `expanded_5`, `t=2` can retain near-exact decision fidelity with material speedup by screening every root and spending exact continuation work only when the root winner remains ambiguous.

This is calibration/validation only. The adaptive policy is disabled in production.

## Frozen design

The fresh M6D calibration corpus, fresh M6D holdout corpus, and preregistered candidate grid were committed before candidate measurement. The M6C holdout is not validation data for M6D.

Every candidate uses the same staged structure:

```text
screen all legal root board actions
→ refine top K=2
→ if ambiguous, refine through K=4
→ if still ambiguous, refine through K=6
→ if still ambiguous, refine every remaining root exactly
```

Ambiguity is observable from the current staged root table only: a winner change versus the preceding stage, or an objective-specific winner/runner-up utility gap at or below the frozen threshold. Refinement is incremental; work completed at an earlier stage is retained at later stages. Stop and menu reroll remain represented throughout.

No stochastic approximation is introduced inside evaluated states. Exact fallback means all remaining root board actions receive the same exact second-token continuation evaluation used by the exact `t=2` root policy.

## Frozen candidates and gate

See `benchmarks/m6d-expanded-adaptive-candidates.json` for the complete preregistered grid. At most one policy may be selected using calibration only.

Minimum gate:

```text
completion rate                   = 100%
root-action agreement             >= 98%
maximum expected-score regret     <= 100
maximum target-probability regret <= 0.001
median speedup                    >= 1.50x
P90 speedup                       >= 1.20x
```

The exact-fallback fraction, stage distribution, memory, structural work avoided, and objective/operation/margin strata are reported but do not add an unregistered acceptance threshold.

## Holdout discipline

If no candidate passes calibration, M6D ends as Outcome B and the holdout is not consumed. If one candidate qualifies, thresholds and candidate identity are frozen in `benchmarks/m6d-selection.json` and that policy is run exactly once against the fresh M6D holdout. No retuning follows.

## Production isolation

M6D must preserve:

- default layout = `legacy_3`;
- production modeled horizon <= 2;
- adaptive expanded policy disabled by default;
- legacy expected-score behavior unchanged;
- legacy target-probability behavior unchanged;
- M5H holdout untouched;
- target `t=3` and `t=4` not run.

## Outcome

Pending authoritative Node 22/Linux calibration.
