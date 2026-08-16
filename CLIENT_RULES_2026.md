# TI 2026 Fantasy Rules and Model Assumptions

This file separates **game rules** from **model assumptions**. Rules describe behavior the optimizer treats as known. Assumptions fill gaps where the client does not publish exact probabilities.

## Fantasy scoring

For each scoring period:

1. The roster is fixed for scoring.
2. Each selected player is scored game by game.
3. Only stats on that role's War Banner count.
4. Scores for paired players are averaged within the role.
5. The best two games in each series are kept.
6. If a role plays multiple series, only its highest-scoring series is kept.
7. Core, Mid, and Support retained scores are added together.

Because paired players are averaged **before** the best games are selected, an exact Core/Support model would need both players aligned to the same games and series. The current pair model is therefore an approximation.

## Base stat scoring

| Stat | Scoring |
|---|---:|
| Kills | +107 per kill |
| Deaths | 1,950 starting points, -195 per death |
| Creep Score | +3 per last hit or deny |
| GPM | GPM × 2 |
| Madstone Collected | +13 each |
| Tower Kills | +352 per tower last hit |
| Wards Placed | +117 per observer ward |
| Camps Stacked | +234 per camp |
| Runes Grabbed | +141 per rune bottled or taken |
| Watchers Taken | +147 per captured watcher |
| Lotuses Grabbed | +176 per lotus |
| Roshan Kills | +1,172 each |
| Teamfight Participation | maximum 2,124 points; exact mapping not specified here |
| Stuns | +10 per second |
| Tormentor Kills | +879 each |
| Courier Kills | +703 each |
| First Blood | 1,934 if the player gets first blood |
| Smokes Used | +293 per Smoke of Deceit used |

## Emblem stat pools

- **RED:** Kills, Deaths, Creep Score, GPM, Madstone Collected, Tower Kills
- **BLUE:** Wards Placed, Camps Stacked, Runes Grabbed, Watchers Taken, Smokes Used, Lotuses Grabbed
- **GREEN:** Roshan Kills, Teamfight Participation, Stuns, Tormentor Kills, First Blood, Courier Kills

A stat reroll must change the stat, stay within the emblem's color pool, and cannot create a duplicate stat on the same banner.

## Quality

| Tier | Stat bonus |
|---|---:|
| I | +10% |
| II | +30% |
| III | +60% |
| IV | +100% |
| V | +150% |

## Traits

- **Fractal:** +60% if every emblem quality on the banner is different.
- **Benevolent:** adjacent emblems receive +20%.
- **Vampiric:** this emblem receives +50%; adjacent emblems receive -10%.
- **Unique:** +30% if it is the only Unique emblem on the banner.
- **Friendly:** +50% if at least three Friendly emblems are on the banner.

A trait reroll must change the trait.

## Effective multiplier

Each emblem starts at 100%. Quality and active trait effects are then added:

```text
effective multiplier = 100% + quality bonus + active trait modifiers
```

Examples:

- Tier V + active Fractal: `100 + 150 + 60 = 310%`
- Tier III next to Benevolent: `100 + 60 + 20 = 180%`
- Tier II with Vampiric: `100 + 30 + 50 = 180%`

Trait effects can stack and can affect neighboring emblems.

## Action menu

The catalogue contains 20 distinct reroll actions. A visible menu contains three distinct actions. Rerolling the menu costs one token and does not change the board.

## Probability assumptions

Where exact client odds are unknown, the optimizer currently assumes:

- legal stat replacements are equally likely;
- the other four quality tiers are equally likely on a quality reroll;
- the other four traits are equally likely on a trait reroll;
- valid higher/lower quality destinations are equally likely for directional changes;
- random quality operations choose eligible slots equally;
- future menus are uniform draws of three distinct actions from the 20-action catalogue;
- successive future menus are fresh draws from the same distribution.

Under the menu assumption there are `C(20,3) = 1,140` possible menus, and a specific action appears in 15% of them.

These are **model inputs**, not claims about Valve's hidden random-number generator.

## Known gaps

- The exact Teamfight Participation mapping to its 2,124-point maximum is not documented here.
- Title-condition scoring is not fully modeled numerically.
- Core/Support pair scoring remains approximate until game-aligned player data are modeled.