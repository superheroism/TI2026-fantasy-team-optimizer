# Expanded screenshot confidence validation — 2026-08-16

This note records the first live browser rerun of the 3719×1827 expanded-layout fixture after PR #44 was merged.

## Result

Extraction remains review-safe but does not yet meet the package acceptance bar.

- total calibrated structured fields assessed: 52;
- high-confidence accepted fields: 42;
- incorrect high-confidence accepted fields: 0;
- low-confidence/review fields: 10;
- correctly review-flagged incorrect fields: 1;
- unnecessarily review-flagged correct fields: 9;
- observed browser latency: 5.622 s.

The single incorrect extracted value is Mid emblem 4 stat: the source is `Madstone Collected`, while the imported board shows `Tower Kills`. Its confidence is ~0.401, so the safety gate is preserved: the wrong value is review-flagged rather than accepted.

The nine unnecessary review flags are the Mid team plus eight correct emblem stats. Two of those stats (`Mid emblem 2: Runes`, `Support emblem 1: Runes`) were successfully corrected by native retry but still received `conflicting-retry` confidence 0.84 because the calibration layer treats any changed retry result as a conflict even though the initial evidence was weak.

The diagnostic also exposes a refinement gating bug: emblem native refinement currently skips the entire card whenever tier and trait are already >= 0.9, even if stat confidence is low. Low-confidence stat-only cards therefore do not necessarily receive the intended native retry.

## UX validation

The board-state screenshot confirms review highlighting is localized correctly: no banner, Available Actions section, or action-card container receives the screenshot-review outline. The Mid team select and individual questionable emblems receive local red outlines. All three imported action selects are unflagged because the dedicated button crops resolved them confidently.

## Follow-up

A small follow-up patch should:

1. require stat + tier + trait all to be >= 0.9 before skipping emblem native refinement;
2. allow an accepted >= 0.9 native stat retry that materially strengthens/replaces weak initial evidence to count as targeted retry rather than conflicting evidence;
3. preserve the conservative conflict cap for genuinely strong disagreeing evidence;
4. rerun this fixture before any broader OCR heuristic change.
