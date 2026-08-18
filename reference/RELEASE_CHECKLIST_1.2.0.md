# v1.2.0 Release Checklist

Use this checklist for the final v1.2.0 candidate.

## Automated gate

- [ ] Node 22 typecheck passes.
- [ ] ESLint passes.
- [ ] Generated `build/` and `docs/` output matches canonical source.
- [ ] Full regression suite passes.
- [ ] Production-route release benchmark completes.

## Product smoke

- [ ] Fresh load uses the intended Main Event defaults.
- [ ] 3-emblem and 5-emblem starter boards load with Tier III emblems and model-backed recommendations.
- [ ] Switching layouts produces the correct starter structure without stale state.
- [ ] Screenshot import still reaches its review/apply flow in Chromium.
- [ ] Available Actions renders all three offers and legal role targets.
- [ ] `Next Reroll · 1 Token` stays unchanged before and after optimization.
- [ ] Score Outlook, Likely Results, and Action Ranking refresh from the selected board.
- [ ] Dark and light modes remain readable without control overlap or horizontal overflow at normal desktop widths.

## Release metadata

- [ ] `package.json` and `package-lock.json` report version 1.2.0.
- [ ] `RELEASE_NOTES_1.2.0.md` reflects the final release scope.
- [ ] The release-preparation PR is merged to `main` with green CI.
- [ ] `v1.2.0` points to the certified `main` commit.
- [ ] GitHub release notes are published from the same commit.
- [ ] The deployed GitHub Pages application receives a final live smoke test.
