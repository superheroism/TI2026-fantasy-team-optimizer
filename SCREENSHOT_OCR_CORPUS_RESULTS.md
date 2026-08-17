# Screenshot OCR Corpus — Verification Results

Date: 2026-08-17

Exploratory native-Tesseract/Linux measurements are used to expose OCR/localization failure modes. Browser Tesseract.js timing will differ. Final acceptance remains normalized imported-state accuracy.

## Seven-image corpus

The corpus now contains seven manually labeled screenshots: the original six cases plus `expanded5-actions-full-client-noone-2048x1151`, the 2048×1151 full Dota-client capture supplied during retry-performance validation. The new case has all three actions visible, 30 tokens, and punctuation-heavy Mid selection `No[o]ne-`. Its source dimensions and SHA-256 are pinned in the ground-truth JSON.

The screenshot binaries remain external to repository CI. Contract tests validate labels, action IDs, roster mapping, and source identity metadata; live browser runs remain authoritative for image-level accuracy and latency.

## 2026-08-17 stat retry consolidation experiment

Goal: determine whether the raw native stat-row PSM-7 retry can be removed so an unresolved stat goes directly from the existing full-emblem PSM-6 retry to the tight whiteness/Otsu PSM-7 fallback.

Two available expanded screenshots were evaluated with native Tesseract 5.5 on the same tight stat-name regions used by the production fallback. This is an exploratory crop-level A/B, not browser certification.

| Source | Raw PSM-7 correct best match | Otsu PSM-7 correct best match | Raw correct with domain score ≥0.92 | Otsu correct with domain score ≥0.92 |
|---|---:|---:|---:|---:|
| prior expanded board | 14/15 | 14/15 | 14 | 13 |
| new 2048×1151 full-client capture | 13/15 | **14/15** | 13 | 13 |

Important field-level findings:

- `Roshan Kills`, the field previously rescued by the raw stat-row retry, matched at 1.0 under both raw and Otsu tight-crop OCR in the tested screenshots.
- `Camps Stacked` on the new full-client capture failed the raw tight crop but matched `CAMPS STACKED` at 1.0 after whiteness/Otsu preprocessing.
- `Madstone Collected` was not reliably recovered by either tight single-line representation. The existing full-emblem multiline PSM-6 stage therefore remains necessary and is retained.
- One `Runes` Otsu crop remained the correct best legal match but scored below the strict 0.92 domain gate. This does not establish a production regression because Otsu is only reached after the full-emblem retry has failed; prior live browser runs resolved that `Runes` field before the stat-specific fallback.
- Median native subprocess recognition time was approximately 87.5 ms for the raw crop versus 85.3 ms for the Otsu crop. The image transform itself is therefore not the relevant cost; the extra `recognize()` invocation is.

The candidate consequently removes the redundant raw stat-row OCR call while retaining the full-emblem multiline retry and the strict Otsu fallback. Confidence gates are unchanged.

A second avoidable retry was found during code review: when an emblem was entered for refinement because some other field was weak, dedicated Tier OCR could run whenever the new full-emblem pass lacked direct Tier evidence even if the existing Tier confidence was already ≥0.90. The candidate now runs the Tier strip only while `qualityTier` itself remains below 0.90.

The current-main full-client browser run was observed by the user to exceed one minute without completing. That is recorded as a qualitative worst-case performance failure, not an exact benchmark. The consolidated branch must be rerun on that same capture before merge.

## Earlier six-image findings

The earlier corpus included four board-only screenshots plus two legacy-three screenshots with all three reroll cards and token counts visible.

Action fixture A: 1232×824 (1.015 MP), tight board/action crop, tokens = 4.

- actions: `blue-trait-first`, `red-trait-all`, `green-stat-first`.
- native whole-image OCR: ~0.55 s exploratory run.
- whole-image OCR sees the action region but merges/garbles adjacent card labels.
- correction from the user-supplied authoritative action table: the third card is **Reroll Stat for the first Green Emblem**. The current 20-action `ACTION_CATALOG` is complete for the supplied evidence.

Action fixture B: 2560×1600 (4.096 MP), full Dota desktop, tokens = 5.

- actions: `green-stat-last`, `quality-increase-one`, `green-stat-random`.
- native whole-image OCR: ~1.19 s exploratory run.
- generic whole-image OCR sees `REROLL OPERATIONS` / token text but does not reliably recover the three individual card labels.

## Baseline geometry findings

| Fixture | Expected | Baseline result before geometry change |
|---|---|---|
| original reference | expanded_5 | PASS: 5/5/5 TIER rows |
| crimson cropped board | expanded_5 | PASS layout; Support only 2/5 TIER anchors |
| full desktop capture | expanded_5 | **FAIL: legacy_3** under equal-third fallback |
| golden cropped board | legacy_3 | PASS: 3/3/3 |

## Implemented parser changes

The importer now addresses the failure mechanisms found by the corpus:

1. **Three-column fallback.** If all `CORE` / `MID` / `SUPPORT` headings are not confidently found, repeated closed-vocabulary card anchors (`TIER`, stat tokens, traits) are clustered into three horizontal card columns instead of dividing the entire uploaded screenshot into equal thirds.
2. **Pooled row geometry.** `TIER` evidence is pooled across all three banners. A role no longer needs to OCR every row independently. Four-row evidence can be regularized to a five-row grid from the repeated pitch, preventing the observed 5→3 collapse.
3. **Native/crop-first policy retained.** Large screenshots use a low-resolution localization copy, then map extraction back to original pixels. No source is blindly normalized to a predetermined resolution.
4. **Dedicated action-strip path.** `REROLL OPERATIONS` / `ROLL TOKENS` anchor the strip. Each action region is evaluated independently and weak text can be retried at source resolution against the closed 20-action catalog.
5. **Token extraction.** The same action region parses an integer token count when visible.
6. **Multiline/native stat refinement.** Weak stats first receive the native full-emblem retry, which can recover multiline names such as `Madstone Collected`.
7. **Whiteness/Otsu stat fallback.** Stats still unresolved are isolated to a tight stat-name region, transformed using `min(R,G,B)` whiteness, contrast-stretched, Otsu-thresholded, and matched only against the legal same-color stat pool.
8. **Failure remains review-safe.** Missing or unreadable fields remain explicitly low-confidence rather than fabricated.

## Build and contract validation

The implementation typechecks and lints under the repository's strict TypeScript configuration. Generated `build/` and `docs/` artifacts are reproducible from canonical source. Corpus contract tests verify both layouts, action-visible/absent cases, emblem counts, token ground truth, canonical action IDs/labels, and the identity/current-roster mapping of the seventh full-client capture.

## Remaining verification

Run the seven actual screenshots through the browser OCR path and record:

- exact layout;
- exact teams where roster mapping is valid;
- exact stat / tier / trait fields;
- exact action order;
- exact token count;
- false-high-confidence errors;
- cold/warm latency and analyzed-pixel fraction;
- targeted retry count and elapsed time.

For the retry-consolidation candidate, the immediate merge gates are:

1. the previously successful 3719×1827 expanded fixture retains exact structured-field extraction and zero false-high-confidence fields;
2. the new 2048×1151 full-client capture completes promptly rather than entering the >60 s retry pathology;
3. `Camps Stacked`, `Roshan Kills`, and `Madstone Collected` remain correct;
4. no corpus fixture loses normalized accuracy because the raw stat-row pass was removed.
