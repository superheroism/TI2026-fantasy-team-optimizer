# Tests

The regression suite is intentionally broader than the current UI surface. It protects engine invariants that later optimizations rely on.

The audit did not remove milestone-era regression tests based on age alone. Current tests cover distinct contracts across these areas:

- rules, action legality, transitions, and compact-state equivalence;
- scoring, statistical models, roster and title behavior;
- expected-score and target-probability search semantics;
- production routing, caches, and worker boundaries;
- 3- and 5-emblem layout behavior;
- screenshot OCR, validation, confidence, review, and browser integration;
- generated deployment and UI contracts.

A test should be removed only when its behavior is covered by another test at the same or stronger boundary, or when the protected behavior is intentionally removed from production. Historical naming by itself is not a reason to delete a regression test.