# v1.2.0 Release Notes

v1.2.0 focuses on faster setup, clearer decisions, and a cleaner project surface. It adds model-backed starter boards, refines the browser UI, documents the statistical-model boundary, and reorganizes repository documentation and historical engineering material.

The production optimizer remains capped at two modeled token spends. This release does not introduce a new scoring model, reroll mechanic, or search horizon.

## Highlights

- **Recommended starter boards:** fresh 3-emblem and 5-emblem boards start at Tier III with legal high-value stats selected from the active tournament model. Teams are then ranked for those completed banners, and Friendly traits provide the strongest uniform-Tier-III starting configuration.
- **Faster board setup:** setup controls now use more consistent sizing and alignment. Banner-layout and screenshot-import controls share a baseline, numeric fields are more compact, and the Objective selector has room for its full label.
- **Clearer banner controls:** Expected Series Played uses simpler helper text, and the refresh prompt is visually quieter.
- **Available Actions:** action numbers and selectors align consistently; expected-change guidance now makes the two-token forecast horizon explicit; the Next Reroll label remains stable before and after optimization.
- **Consistent role selectors:** Core, Mid, and Support controls use the same visual treatment across Available Actions and Likely Results.
- **Decision readability:** Score Outlook, Likely Results, and Action Ranking use a consistent heading/subheading/description hierarchy and plainer user-facing language.
- **Model documentation:** `MODEL.md` now documents the repository-supported statistical inputs, quantile distributions, Spearman dependence model, Gaussian-copula simulation, scoring boundary, and model provenance.
- **Repository cleanup:** current references moved under `reference/`; milestone-specific scripts and benchmark evidence were separated from active tooling; obsolete root artifacts were removed; generated `docs/` remains the GitHub Pages deployment tree.

## Model and optimizer scope

The application consumes precomputed team/role/stat distributions and role-level dependence matrices. It does not reproduce the upstream model-fitting pipeline. Historical weighting, game-length adjustments, calibration metrics, and other upstream validation remain provenance rather than executable training code in this repository.

Production optimization continues to use the supported horizon implied by token state. With one remaining token, only one spend can be modeled. With two or more tokens, production search remains capped at two modeled spends. No user-selectable 1-step/2-step override is introduced in v1.2.0.

## Compatibility

- 3-emblem and 5-emblem layouts remain supported.
- Expected-score and target-probability objectives remain supported.
- Group Stage and Main Event statistical datasets remain supported.
- Screenshot import remains review-first: uncertain fields are surfaced instead of silently accepted.
- Chromium remains the release-certified screenshot-import browser. Firefox screenshot import remains uncertified.
- Existing scoring, legality, reroll probabilities, and production search semantics remain unchanged unless noted above.

## Release certification

v1.2.0 is released only after the final release-preparation commit passes the Node 22 CI gate, including typecheck, lint, generated-output reproducibility, and the full regression suite. The production-route benchmark is rerun as release evidence.

The immutable `v1.2.0` tag identifies the certified release commit.
