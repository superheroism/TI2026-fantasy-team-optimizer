# M6C — Expanded-Board t=2 Approximation Calibration

**Status:** calibration preregistered; authoritative Node 22 run pending  
**Frozen base:** `42a1a7ec7553e7d6df5f4d3c5576417fcdbbb35a`

The frozen calibration corpus, one-shot holdout corpus, candidate grid, decision-margin bins, acceptance thresholds, and deterministic selection rule are committed before candidate results are inspected.

M6C evaluates adaptive root refinement only. Every legal root board action receives an exact one-step screen. Stop and menu reroll remain represented. The top K screened board actions receive exact second-token continuation; unrefined roots stop after their first action. Candidate K is preregistered as 2, 4, and 6.

The M5D progressive-widening implementation is intentionally not reused as the M6C approximation: at t=2, its fresh-menu action is already at one token remaining, so its shallow and deep action values both terminate after that action and do not remove the expanded terminal frontier identified by M6B.

Production is unchanged: `legacy_3`, modeled horizon <=2, expanded approximation disabled. M5H holdout remains untouched and target t=3/t=4 remain frozen.
