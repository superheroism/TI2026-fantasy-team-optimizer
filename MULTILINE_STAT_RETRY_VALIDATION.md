# Multiline screenshot stat retry validation

This follow-up begins from `main` after PR #46 (`fc30c087`).

## Root cause

Native emblem stat refinement previously matched only the first OCR line (`ls[0]`) for a low-confidence stat. That assumption is unsafe for client stats rendered across multiple visual/OCR lines, such as `MADSTONE` / `COLLECTED`.

## Change

Stat refinement now evaluates legal color-pool matches over:

- each OCR line independently;
- each adjacent pair of OCR lines concatenated in reading order;
- all non-empty OCR lines concatenated in reading order.

Displayed percentage tokens are removed before stat-domain matching so multiplier text does not become part of the candidate stat name. OCR confidence is still computed only from the OCR lines that supplied the selected candidate.

This does not change legal stat pools, OCR recognition parameters, or the existing acceptance gates (`domain match >= 0.92`, combined confidence >= 0.90`).

## Deterministic coverage

Tests cover:

- a corrupted `MADST0NE` first half plus `COLLECTED` on the following line, which requires joined multiline evidence to clear the match threshold;
- a percentage split onto its own OCR line;
- unchanged single-line `Tower Kills` behavior;
- unrelated weak multiline OCR remaining below the acceptance threshold.

Regeneration/build/typecheck/lint/generated verification and the full Node 22 suite passed 282/282 before the final branch cleanup.

## Live gate

Rerun the 3719×1827 expanded fixture. The primary safety requirement remains zero false-high-confidence fields. Specifically check whether Mid emblem 4 resolves to `Madstone Collected` rather than low-confidence `Tower Kills`, and record any change in remaining review flags and latency.
