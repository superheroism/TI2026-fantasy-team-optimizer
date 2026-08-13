# TI 2026 Fantasy Rules and Model Assumptions

This file separates rules the optimizer treats as game mechanics from probability assumptions used when the game does not specify an exact reroll distribution.

## Fantasy scoring

For each scoring period:

1. The active roster is fixed for scoring.
2. Each selected player is scored game by game.
3. Only stats on that role's War Banner contribute.
4. Player scores are averaged within the role.
5. The best two games in each series are retained.
6. If a role plays multiple series, only its highest-scoring series is retained.
7. Core, Mid, and Support retained-role scores are summed.

Because player averaging happens before best-game selection, an exact pair model would require players to be aligned at the game and series level. Pairing already-aggregated player distributions is an approximation.

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

A stat reroll must produce a different stat, and a War Banner cannot contain duplicate stats.

## Quality

| Tier | Stat bonus |
|---|---:|
| I | +10% |
| II | +30% |
| III | +60% |
| IV | +100% |
| V | +150% |

## Traits

- **Fractal:** +60% if all emblem qualities on the War Banner are different.
- **Benevolent:** adjacent emblems receive +20%.
- **Vampiric:** this emblem receives +50%; adjacent emblems receive -10%.
- **Unique:** +30% if this is the only Unique emblem on the War Banner.
- **Friendly:** +50% if at least three Friendly emblems are on the War Banner.

A trait reroll must produce a different trait.

## Effective multiplier

The tool derives each emblem's multiplier from quality and every active trait effect on the banner:

```text
effective multiplier = 100% + quality bonus + active trait modifiers
```

Trait modifiers stack additively and may affect neighboring emblems.

Examples:

- Tier V + active Fractal: `100 + 150 + 60 = 310%`
- Tier III adjacent to Benevolent: `100 + 60 + 20 = 180%`
- Tier II with Vampiric: `100 + 30 + 50 = 180%`

## Action menu

The action catalogue contains 20 distinct reroll actions. A visible menu contains three distinct actions. A menu reroll costs one token and leaves the board unchanged.

## Optimizer probability assumptions

The current probability model assumes:

- stat rerolls are uniform over legal replacement stats;
- quality rerolls are uniform over the other four tiers;
- trait rerolls are uniform over the other four traits;
- directional quality changes are uniform over valid destination tiers;
- random quality operations choose eligible slots uniformly;
- future menus are uniform draws of three distinct actions from the 20-action catalogue;
- successive future menus are treated as fresh draws from the same distribution.

Under the menu assumption there are `C(20,3) = 1,140` possible menus, and any specific action appears in `3/20 = 15%` of them.

These probabilities are model inputs, not stronger claims about hidden client RNG.

## Known gaps

- The exact Teamfight Participation mapping to its 2,124-point maximum is not specified here.
- Title-condition scoring is not fully modeled numerically.
- Pair-level scoring is approximate until exact game-aligned player data are modeled.
