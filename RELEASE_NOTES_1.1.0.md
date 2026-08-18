# v1.1.0 Release Notes

v1.1.0 is a substantial feature release. The optimizer can now import a board from a screenshot, switch between pre-TI and group-stage statistical models, and enforce current Main Event team eligibility. It also includes the 3/5-emblem UI pass and clearer review and decision metrics.

The search horizon and core scoring/search semantics are unchanged from v1.0.

## Highlights

- **Screenshot import:** OCR (optical character recognition) can populate layout, teams, emblem stat/tier/trait fields, visible reroll actions, and token count from a Dota Fantasy screenshot. Low-confidence or unresolved fields remain highlighted for review rather than being silently trusted.
- **Two statistical datasets:** the Data Source selector now offers `Pre-TI2026-Correlations` and `GroupStage-Correlations`. Both use the same distribution- and correlation-aware scoring and optimizer pipeline.
- **Main Event eligibility:** current selectable teams are separate from historical statistical observations. Eliminated teams can remain in historical data without being recommended.
- **Expected Series defaults:** 3-emblem boards default to 5 series; 5-emblem boards default to 3. Manual overrides survive later layout switches.
- **Available Actions UI:** options are grouped Red → Blue → Green → Boosts, with Stat → Quality → Trait ordering inside each color.
- **Review UX:** screenshot uncertainty is highlighted at the specific editable field. Recommendation confidence labels that did not represent outcome probability were removed.
- **Decision metrics:** menu reroll reports `P(Board EV ↑)` under the same future-menu model used for its EV. Stop is defined as 0% improvement probability.

## Compatibility and model scope

- 3-emblem and 5-emblem layouts remain supported.
- Expected-score and target-probability objectives remain supported.
- Production search remains capped at two modeled token spends.
- `Pre-TI2026-Correlations` remains the default statistical source.
- No dataset-specific optimizer, transition, scoring, menu, or legality path was introduced.
- The group-stage source contains updated profiles for the active Main Event field. Missing updated profiles for eliminated teams were not fabricated.

## Release certification

Release-candidate product SHA: `7f902b5f013063c667c28918a640a6548148fb06`.

### Node 22 and production search

The Node 22 release gate passed typecheck, ESLint, generated-output reproducibility, and the full regression suite. The production-route benchmark completed all eight supported layout × objective × horizon routes:

| Route | RC wall time |
|---|---:|
| 3 Emblems · expected score · t=1 | 188.9 ms |
| 3 Emblems · expected score · t=2 | 987.2 ms |
| 3 Emblems · target probability · t=1 | 377.0 ms |
| 3 Emblems · target probability · t=2 | 4.46 s |
| 5 Emblems · expected score · t=1 | 202.5 ms |
| 5 Emblems · expected score · t=2 | 854.7 ms |
| 5 Emblems · target probability · t=1 | 578.6 ms |
| 5 Emblems · target probability · t=2 | 5.27 s |

These shared-runner timings are release evidence, not hard performance thresholds.

### Browser/UI smoke

Chromium passed dark/light × 3/5-emblem visual smoke. Each case passed the automated overflow, zero-sized-control, banner-overlap, banner-count, and emblem-count checks. The captured screenshots were also inspected during release preparation.

### Screenshot-import certification

The six-board production end-to-end (E2E) corpus runs through the real `docs/` application path and includes 13 cold/warm imports per browser.

**Chromium:** 13/13 imports reached raw → validated → applied state; 0 hard failures; 0 OCR timeouts; 0 false-high-confidence errors; 9/13 rendered fully exact; and 13/13 rendered the expected review state. The non-exact cases remained review-safe rather than being promoted to incorrect high-confidence values.

**Firefox:** screenshot import is not release-certified in v1.1. All 13 Firefox corpus runs failed before raw import because local OCR could not resolve layout. There were no recorded false-high-confidence fields; the failure is fail-closed. Firefox/Tesseract parity is deferred follow-up work.

Deployment parity passed for the committed/local OCR asset against the deployed GitHub Pages asset during the release-candidate run.

## Release boundary

v1.1.0 does not increase the lookahead horizon, change reroll probabilities, alter legal stat pools, or introduce a new scoring model. The release adds a more practical Main Event workflow without changing the optimizer's underlying decision policy.
