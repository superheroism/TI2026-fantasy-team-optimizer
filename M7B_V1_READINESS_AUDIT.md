# M7B — v1.0 Readiness Audit and Release Contract

**Status:** PASS — ready for v1.0 after merge/release tagging  
**M7B_BASE_SHA:** `aa8a880905859f94c4865d7b7a17adb61ad7376c`  
**Architecture authority:** `ENGINEERING_ROADMAP.md`

M7B audits and freezes the already validated production surface. It does not expand search depth or retune the M6E policy.

## 1. Frozen v1.0 production contract

Production modeled horizon is **at most two token spends**.

| Layout | Objective | t=0 | t=1 | t=2 | t>2 |
|---|---|---|---|---|---|
| `legacy_3` | expected score | exact terminal | exact | exact | unsupported in production |
| `legacy_3` | target probability | exact terminal | exact | exact | unsupported in production |
| `expanded_5` | expected score | exact terminal | exact | M6E `adaptive-tight` | unsupported in production |
| `expanded_5` | target probability | exact terminal | exact | M6E `adaptive-tight` | unsupported in production |

For `expanded_5`, t=2 uses the unchanged frozen M6E policy. Its K=2 → K=4 → K=6 staged refinement falls back to exact evaluation when required by the certified policy. Invalid policy/configuration or integration-invariant failure also routes to exact evaluation. The UI exposes neither K controls nor deeper engineering horizons.

Explicit engineering/oracle horizon overrides remain outside the product contract and preserve their historical exact semantics unless an experimental policy is explicitly supplied by engineering code. They are not reachable from normal UI requests.

## 2. Production routing audit

| Request | Required route | Evidence | Status |
|---|---|---|---|
| any layout, t=0 | terminal stop, exact | M7B regression | FIXED IN M7B |
| `legacy_3`, t=1 | exact | existing + M7B routing regression | PASS |
| `legacy_3`, t=2 | exact | M6E + M7B routing regression | PASS |
| `expanded_5`, t=1 | exact | M6E + M7B routing regression | PASS |
| `expanded_5`, t=2 | frozen `adaptive-tight` | M6E + M7B routing regression | PASS |
| M6E unresolved ambiguity/config failure | exact fallback | M6E integration suite | PASS |
| normal request with >2 tokens | modeled horizon capped at 2 | M7B regression | PASS |
| engineering exact override | exact/oracle path | M6E integration suite | PASS |

Two release-contract defects were found and corrected without altering search mathematics:

1. zero-token states were terminal in behavior but diagnostics reported modeled horizon 1; they now report t=0 and expose only stop;
2. the root recommendation path offered menu reroll even when `menuRerollAvailable=false`; root availability is now honored while future-menu value-function semantics remain unchanged.

No M6E stage, threshold, fallback, or policy configuration was changed.

## 3. Correctness and semantic coverage

| User-visible behavior | Coverage | Status |
|---|---|---|
| legal stat pools by color | client-rules/action/transition tests | PASS |
| duplicate-stat restrictions | transition equivalence/adversarial tests | PASS |
| quality tiers; Tier-I/V floor/cap | client-rules + transition equivalence | PASS |
| trait mechanics/active bonuses | banner/client-rule tests | PASS |
| stat reroll | compact/reference transition equivalence | PASS |
| quality reroll | compact/reference transition equivalence | PASS |
| trait reroll | compact/reference transition equivalence | PASS |
| random quality increase | compact/reference transition equivalence | PASS |
| quality redistribution | compact/reference transition equivalence, including five-slot geometry | PASS |
| operation target/scope | action-catalog + transition tests | PASS |
| transition normalization/aggregation | transition equivalence tests | PASS |
| menu reroll | menu-model/menu-reroll tests + M7B availability regression | FIXED IN M7B |
| stop/lock | optimizer tests + M7B t=0 regression | PASS |
| free roster optimization | scoring/optimizer regressions | PASS |
| free title optimization | title/target-objective regressions | PASS |
| expected-score objective | optimizer/M6E/M7B routes | PASS |
| target-probability objective | target-objective/M6E/M7B routes | PASS |
| deterministic tie-breaking | determinism/M6E regressions | PASS |
| token accounting | menu/optimizer/layout tests | PASS |
| `legacy_3` geometry | M6A/M6F layout tests | PASS |
| `expanded_5` geometry | M6A/M6F layout tests | PASS |
| 3↔5 conversion | M6F layout tests | PASS |
| worker/synchronous parity | M6F + M7B worker regressions | PASS |
| stale-worker suppression | M6F cancellation regression | PASS |
| exact fallback | M6E integration regression | PASS |

No uncovered user-visible transition or scoring mechanic was found that justified rewriting a proven subsystem.

## 4. Browser and worker readiness

The production optimizer remains behind `OptimizerWorkerClient → optimizer.worker → engine`. M6F browser evidence measured **0 ms of main-thread Long Tasks** during all recorded optimization cases, including expanded target-probability and exact-fallback cases. Active superseded work is terminated, request IDs reject late stale responses, and state/layout/menu/token edits invalidate displayed recommendations through the application-state boundary.

Existing integration tests cover worker/synchronous recommendation identity, cancellation, stale-response suppression, layout conversion, expanded adaptive routing, and exact fallback. Worker errors are surfaced as recoverable optimization errors; model-load failures do not substitute synthetic data.

M6F's recorded expanded target-probability case took about 7.7 s cold and 4.5 s warm while leaving the main thread responsive. This is substantial latency but is an already-supported route, not a newly introduced M7B regression. No worker pool or parallel search was added.

## 5. Data, rules, and schema compatibility

M7B adds explicit fail-fast validation for the production statistical-model structure and hardens the title-model validator. The loader now checks:

- top-level model shape and quantile levels;
- Core/Mid/Support teams, stat descriptors, team/stat cells, quantile lengths, and finite effective-game values;
- square, finite role-correlation matrices and references to known raw stat keys;
- title schema version, prefixes/suffixes, fixed suffix, and complete role/team prefix boosts;
- downstream canonical-stat conversion sufficient to produce usable role profiles/correlations.

The statistical model contract is identified in code as `ti2026-statistical-model-v1`; the title model remains schema version 1. Malformed or incompatible data now fail clearly instead of progressing through partial conversion.

Board-layout IDs are validated by the existing versioned rules/state engine; M6E policy configuration is validated by the existing certified-policy build/runtime checks. Layout identity is already included where mechanics/scoring identity requires it.

## 6. Cache and memory inventory

| Cache | Key/lifetime | Bound/invalidation | v1 disposition |
|---|---|---|---|
| compact transition cache | layout + role + banner ID + operation mechanics; module/worker lifetime | finite state/mechanics domain; explicit clear API; not hard-LRU bounded | PASS — documented |
| target prepared-summary cache | prepared candidate object identity; module lifetime | `WeakMap`; GC follows candidate identity | PASS |
| target pair cache | prepared group object pairs | `WeakMap`; estimated-byte reset at 256 MiB | PASS |
| target suffix cache | prepared group identity | `WeakMap`; estimated-byte reset at 128 MiB | PASS |
| target scratch pool | sample length | max 4 arrays per encountered length | PASS |
| scoring sample/ranking/frontier/raw-scenario caches | `DataBundle` weak key + mechanics/profile keys; worker lifetime while bundle lives | bundle identity is invalidation/version boundary; inner maps may grow across successful session optimizations | PASS — documented, observe post-v1 |
| finite-horizon V/Q/action/terminal caches | optimizer runtime/request | request-scoped/naturally released | PASS |

The Node release baseline records per-process high-water proxies; prior M6F browser evidence records repeated-run page-heap behavior but notes that browser `performance.memory` does not include the worker isolate. No realistic production leak was demonstrated, so M7B does not add speculative LRU policy. The persistent scoring caches are the one post-v1 item worth continued observation during long sessions.

## 7. Production performance baseline

Authoritative artifact: `benchmarks/m7b-v1-production-baseline.json`.

Protocol:

- Node 22 only;
- fresh process for every route;
- production model/data and default menu;
- exact normal production entry point, not engineering overrides;
- eight required layout × objective × horizon cases;
- transition, target-search, adaptive-stage, terminal-scoring, and RSS/heap diagnostics captured where applicable.

This is a release baseline, not a latency gate or optimization contest. See `PERFORMANCE.md` for the final recorded table.

## 8. Repository/tooling audit

| Item | Disposition | Reason |
|---|---|---|
| TypeScript typecheck | PASS | CI-required |
| generated-output reproducibility | PASS | CI-required; committed `build/`/`docs/` verified |
| full Node regression suite | PASS | Node 22 evidence run green |
| source/generated authority policy | PASS | `BUILD_AND_SOURCE_POLICY.md` remains explicit |
| architecture/import boundaries | PASS | decomposed M6G boundaries plus regression coverage; no release violation found |
| linting | DEFERRED — NON-BLOCKING | no correctness blocker found; adding a new formatter/linter stack during release audit adds churn |
| formatting automation | DEFERRED — NON-BLOCKING | same; current repository conventions are stable enough for v1 |
| general dead-code detector | DEFERRED — NON-BLOCKING | typecheck/tests cover reachable release surface; no blocker identified |
| schema checks | FIXED IN M7B | production statistical/title input validation hardened |

M7B intentionally does not perform broad cosmetic refactors or adopt new frontend tooling.

## 9. User-facing failure/confidence audit

| State | Behavior | Status |
|---|---|---|
| invalid/malformed model data | load/optimization fails clearly; no synthetic substitute | FIXED IN M7B / PASS |
| unsupported production depth | normal route caps at t=2; deeper controls not exposed | PASS |
| worker failure | recoverable optimization-error state | PASS |
| cancelled/stale request | ignored/rejected; cannot overwrite newer state | PASS |
| M6E invariant/config failure | exact fallback | PASS |
| M6E unresolved ambiguity | exact fallback | PASS |
| no legal board action | stop remains legal | PASS |
| zero tokens | exact terminal stop only | FIXED IN M7B |
| unavailable root menu reroll | no menu-reroll row | FIXED IN M7B |

The UI does not label M6E's certified adaptive route as exact. When exact fallback is invoked, the returned result is exact for that route.

## 10. v1.0 release checklist

| Area | Result | Evidence / note |
|---|---|---|
| correctness | PASS | existing semantic suites + M7B regressions |
| production routing | FIXED IN M7B | t=0 diagnostic and root reroll availability fixed; matrix now explicit |
| performance baseline | PASS | eight-route Node 22 artifact recorded |
| worker/browser behavior | PASS | M6F browser evidence + M6F/M7B integration tests |
| data/schema validation | FIXED IN M7B | explicit statistical/title validation |
| cache/memory safety | PASS | bounded/request-scoped/weak caches plus documented persistent scoring-cache observation item |
| CI/tooling | PASS | typecheck, generated verification, regression suite green; lint/format/dead-code tooling deferred non-blocking |
| documentation | FIXED IN M7B | README, PERFORMANCE, roadmap, this audit |
| deployment | DEFERRED — NON-BLOCKING | merge/tag/deploy are release actions after this draft PR; no architecture blocker |
| versioning | DEFERRED — NON-BLOCKING | create the `v1.0.0` release/tag after M7B merges; no package/tag claim made prematurely |

**BLOCKS V1.0: none.**

## 11. Acceptance gate

```text
v1.0 production contract             = explicit
supported route regressions           = 0
known semantic coverage gaps          = closed or non-blocking
M6E policy changes                    = 0
M5H holdout consumed                  = no
target t=4 begun                      = no
expanded_5 t=3 begun                  = no
uncertified deep search exposed       = no
worker/synchronous parity             = preserved
production benchmark baseline         = recorded
data/schema compatibility             = validated
cache/memory risks                    = bounded or documented
build/tests/generated output          = green
release checklist                     = complete
```

**Result: PASS.**

## 12. Post-v1 research boundary

M7B does not consume the M5H holdout, reopen target-probability t=3 tuning, begin expanded t=3/t=4, add probability truncation, alter progressive-widening schedules, add learned continuation values, add multi-worker search, or add another exact-cache layer.

M7A's result remains the current research direction: exact preparation/evaluation reuse is already strong, while newly reached frontier work dominates deeper refinement. Future performance research should therefore target **frontier reduction** under a separately frozen and validated package rather than assume another cache will solve the problem.

## Final answer

**Yes. The current optimizer is defensible as v1.0 with the contract above: both board layouts and both objectives are supported through two modeled token spends; legacy search is exact, expanded five-emblem t=2 uses the frozen certified adaptive-tight route with exact fallback, and deeper horizons are explicitly outside the production contract.**
