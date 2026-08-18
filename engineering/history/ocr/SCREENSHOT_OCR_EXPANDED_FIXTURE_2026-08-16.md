# Expanded-layout OCR live fixture — 2026-08-16

Source: 3719×1827 desktop screenshot of the Dota 2 Fantasy expanded (3×5) board.

Observed ground truth:

- layout: `expanded_5`;
- Core stats: GPM, Teamfight Participation, Creep Score, Roshan Kills, Tower Kills;
- Mid stats: Tower Kills, Runes, Teamfight Participation, Madstone, Roshan Kills;
- Support stats: Runes, Teamfight Participation, Camps Stacked, Roshan Kills, Smokes Used;
- Core tiers: IV, III, V, III, II;
- Mid tiers: V, V, V, II, V;
- Support tiers: V, II, V, III, III;
- Core traits: Fractal, Vampiric, Vampiric, Unique, Fractal;
- Mid traits: Friendly, Benevolent, Benevolent, Friendly, Fractal;
- Support traits: Friendly, Unique, Vampiric, Benevolent, Vampiric;
- teams: Team Vision / Team Falcons / Team Liquid;
- offers: `Reroll Trait for the First Blue Emblem`, `Randomly Increase One Quality`, `Reroll Trait for Red Emblems`;
- roll tokens: 30.

The browser diagnostic correctly inferred the expanded layout, all five observed row centers, and all 15 stats, but quality/trait/team/footer extraction remained incomplete. The action parser returned `action-region-anchor-not-found` and token count was unresolved.

This fixture is now the primary expanded-layout browser acceptance case. Do not change the stat extraction path merely to improve other fields; use field-specific native-resolution refinement and conservative review flags.
