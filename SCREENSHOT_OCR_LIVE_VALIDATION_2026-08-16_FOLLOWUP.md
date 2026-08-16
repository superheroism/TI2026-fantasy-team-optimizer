# Screenshot OCR live follow-up — 2026-08-16

## Browser result after PR #40

The same 2560×1600 phone-browser fixture was rerun after the token-aware extraction fix. The rerun confirmed that the safety-critical `130% -> 30% -> Tier II @ 0.99` error is gone. Explicit OCR tokens now survive normalization (`DEATHS`, `GPM`, `FRIENDLY`, `VAMPIRIC`), and action cards 1 and 3 resolve correctly.

The extraction lattice remained stable: card-anchor clustering recovered all three columns, three observed rows, `legacy_3`, and no synthesized rows. This confirms that another wholesale geometry rewrite is not justified by this fixture.

## Remaining failures

Several small card fields remain unreadable in the 1440 px extraction pass, especially quality numerals/bonuses and short stat titles. Core/Mid team evidence is also too small at extraction resolution. The middle action is correctly ranked as `quality-increase-one` but its noisy browser string scores about 0.56, just below the production 0.58 acceptance gate. Token count is not present in extraction OCR despite being visible in the source.

## Follow-up correction

- Retry only unresolved emblem cards from small native-resolution ROIs mapped from the recovered extraction lattice; one card retry supplies stat, tier, and trait evidence together.
- Retry weak team/player regions at native resolution.
- Keep the action catalog constraint, but recognize stable truncated OCR stems such as `INC*` for `INCREASE`; the noisy live string must clear the existing 0.58 gate rather than lowering the gate globally.
- When token count is absent, run one native footer retry derived from the observed action anchor.
- Do not repeat full-resolution whole-image OCR and do not upscale.
- A localization fallback followed by independently observed extraction columns/rows receives a 0.92 confidence cap; extraction fallback or synthesized rows retain the stricter 0.85 cap.

The change remains browser-gated: CI validates deterministic behavior and generated artifacts, but the same live fixture must be rerun before a merge recommendation.
