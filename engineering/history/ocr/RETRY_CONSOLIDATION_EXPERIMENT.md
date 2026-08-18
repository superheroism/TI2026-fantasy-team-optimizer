# Screenshot Retry Consolidation Experiment

Status: live-validation candidate.

Base: `main` after merged PR #49 (`f72080f7`).

## Question

Can the screenshot importer remove redundant native OCR retries without reducing normalized corpus accuracy or weakening the 0.90 review-confidence safety policy?

## Candidate

1. Retain the native full-emblem PSM-6 retry. This remains the multiline recovery path for fields such as `Madstone Collected` and can improve Stat, Tier, and Trait from one recognition pass.
2. Remove the separate raw stat-row PSM-7 retry.
3. If Stat remains below 0.90 after the full-emblem retry, go directly to the tight whiteness/Otsu PSM-7 stat-name retry.
4. Run the dedicated Tier PSM-7 strip only if `qualityTier` itself remains below 0.90.
5. Do not change domain-match thresholds, combined-confidence thresholds, team logic, action logic, or review semantics.

## Offline evidence

Native Tesseract 5.5 crop-level A/B testing on two available expanded screenshots found:

- prior expanded board: raw and Otsu each produced 14/15 correct best stat matches;
- new 2048×1151 full-client board: raw produced 13/15 correct best matches; Otsu produced 14/15;
- `Roshan Kills` matched at 1.0 under both representations;
- the new full-client `Camps Stacked` crop failed raw OCR but matched at 1.0 after Otsu preprocessing;
- neither tight single-line representation reliably recovers multiline `Madstone Collected`, supporting retention of the full-emblem stage;
- median raw and Otsu recognition times were approximately 87.5 ms and 85.3 ms respectively, so the relevant cost is the extra Tesseract recognition call rather than preprocessing.

These measurements are exploratory and do not replace browser validation.

## Corpus addition

The seventh case is `expanded5-actions-full-client-noone-2048x1151`, source `TI2026 - Board 2.png`, 2048×1151, SHA-256 `9b3fc2aed9375a49f3cdce2ffffff0e79cb357feb5054e040cb55d5a1ae2c5d2`.

## Live gates

Do not merge until:

1. the prior 3719×1827 expanded fixture retains exact structured fields and zero false-high-confidence fields;
2. the new full-client fixture completes promptly rather than reproducing the observed >60-second noncompletion;
3. `Roshan Kills`, `Camps Stacked`, and `Madstone Collected` remain correct;
4. the seven-image live corpus shows no normalized-accuracy regression and zero false-high-confidence structured values.
