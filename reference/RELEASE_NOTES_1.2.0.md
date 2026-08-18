# v1.2.0 release notes

v1.2.0 makes the optimizer faster to set up and easier to read. It adds recommended starter boards, improves the browser UI, explains how the statistical model is used, and simplifies the repository structure.

The optimizer still looks ahead at most two token spends. This release does not change scoring, reroll mechanics, or the search horizon.

## Highlights

- **Recommended starter boards:** New 3-emblem and 5-emblem boards start with Tier III emblems and strong legal stats from the selected tournament dataset. The optimizer then selects a strong team and compatible traits for each banner. These defaults are a quick guide; replace them with your actual board before optimizing.
- **Faster board setup:** Setup controls now have more consistent sizes and alignment. Numeric fields are narrower, the Objective field is wider, and the layout and screenshot-import controls share a baseline.
- **Clearer controls:** Expected Series Played uses simpler helper text, and the refresh message is less prominent.
- **Clearer actions:** Action numbers and menus align consistently. Available Actions now explains that expected changes can include a second token spend after the first choice. The Next Reroll label no longer changes after optimization.
- **Consistent role buttons:** Core, Mid, and Support use the same button style in Available Actions and Likely Results.
- **Easier results:** Score Outlook, Likely Results, and Action Ranking use the same heading structure and simpler descriptions.
- **Model documentation:** `MODEL.md` explains the statistical inputs, quantile distributions, correlations, simulation method, scoring boundary, and the limits of the model data stored in this repository.
- **Cleaner repository:** Current reference documents now live under `reference/`. Historical milestone records are separate from active tooling, and obsolete root files were removed. `docs/` remains the generated GitHub Pages deployment tree.

## Model and optimizer scope

The application uses precomputed fantasy-point distributions for each team, role, and stat, along with correlations between stats. It does not contain the code that originally fit those distributions. Historical weighting, game-length adjustments, calibration measures, and other upstream validation are therefore documented as model provenance rather than executable training code.

With one token left, the optimizer can model one spend. With two or more tokens, it looks ahead at most two spends. v1.2.0 does not add a user setting for the search horizon.

## Compatibility

- 3-emblem and 5-emblem layouts are supported.
- Expected final score and target-probability objectives are supported.
- Group Stage and Main Event datasets are supported.
- Screenshot import flags uncertain fields for review instead of accepting them silently.
- Chromium is the certified browser for screenshot import in v1.2. Firefox screenshot import is not certified.
- Scoring, reroll probabilities, legal actions, and production search behavior are unchanged unless noted above.

## Release checks

The release candidate passed the Node 22 CI checks, including typecheck, lint, generated-output verification, and the full regression suite. It also passed the production-route benchmark.

The `v1.2.0` tag identifies the certified release commit.
