# Engineering history

This directory preserves detailed milestone reports, experimental methods, benchmark evidence, and negative results from development of the optimizer.

These files are historical references. They do not define current product behavior.

For the current system, start with:

- `../../README.md` — product use and limitations.
- `../../ENGINEERING.md` — current architecture and search design.
- `../../PERFORMANCE.md` — current performance contract.
- `../../CLIENT_RULES_2026.md` — game rules and probability assumptions.

## Milestone summary

| Milestone | Main result |
|---|---|
| M1–M2 | Established reproducible builds, regression baselines, instrumentation, and cleaner engine boundaries. |
| M3 | Added compact canonical state IDs and cheaper search identity. |
| M4 | Added the finite-horizon value-function foundation, reusable scenarios, and analytic future-menu evaluation. |
| M5 | Measured deeper search and tested continuation compression, progressive widening, and target-probability refinement. Production remained capped at two spends. |
| M6 | Added versioned 5-emblem layouts, profiled expanded-board search, introduced validated adaptive two-spend search, moved optimization to a worker, and decomposed the UI. |
| M7 | Tested additional exact-work reuse, found little useful duplication, and froze the supported production performance boundary. |
| P-series | Developed and validated screenshot import, OCR recovery, review behavior, and browser certification. |

## Use the archive when needed

Use milestone files when you need an exact experiment design, benchmark condition, rejected alternative, or historical rationale that would be difficult to reconstruct from a code diff.

Historical terminology is preserved as written. Older reports can use **exact** where current documentation uses **full production-reference search** or **reference search**. Check the current implementation and current documentation before carrying an old threshold, term, or production claim forward.

Git history and pull requests remain the authoritative record of code changes.