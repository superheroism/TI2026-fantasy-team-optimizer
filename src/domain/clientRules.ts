import type { QualityTier, StatName, TraitName } from './types.js';

/**
 * Authoritative TI 2026 client rules transcribed from the in-client Scoring page.
 * Exact source screenshots supplied by the user on 2026-08-10.
 */
export const BASE_STAT_SCORING: Record<StatName, string> = {
  'Kills': '+107 per kill',
  'Deaths': '1,950 starting points, -195 per death',
  'Creep Score': '+3 per last hit or deny',
  'GPM': "player GPM × 2",
  'Madstone': '+13 per Madstone collected',
  'Tower Kills': '+352 per tower last hit',
  'Wards Placed': '+117 per observer ward placed',
  'Camps Stacked': '+234 per camp stacked',
  'Runes': '+141 per rune bottled or taken',
  'Watchers': '+147 per captured watcher',
  'Lotuses': '+176 per lotus taken',
  'Roshan Kills': '+1,172 per Roshan kill',
  'Teamfight Participation': 'maximum 2,124 points; exact client mapping from participation rate is not stated in supplied screenshot',
  'Stuns': '+10 per second of stun',
  'Tormentor Kills': '+879 per Tormentor kill',
  'Courier Kills': '+703 per courier kill',
  'First Blood': '1,934 points if the player gets first blood',
  'Smokes Used': '+293 per Smoke of Deceit used',
};

export const QUALITY_BONUS_PCT: Record<QualityTier, number> = {
  1: 10,
  2: 30,
  3: 60,
  4: 100,
  5: 150,
};

export const TRAIT_RULE_TEXT: Record<TraitName, string> = {
  Fractal: '+60% to the stat bonus if all emblem qualities on the War Banner are different',
  Benevolent: 'Provides a 20% bonus to the stat value of adjacent emblems',
  Vampiric: 'Increases this emblem stat value by 50%, but lowers adjacent emblem stat values by 10%',
  Unique: '+30% to the stat bonus if this is the only Unique emblem on the War Banner',
  Friendly: '+50% to the stat bonus if there are at least 3 Friendly emblems on the War Banner',
};

export const CLIENT_SCORING_PIPELINE = {
  rosterSnapshotAtPeriodStart: true,
  playerScoredPerGame: true,
  titleConditionsAppliedToPlayerScore: true,
  rolePlayersAveragedPerGame: true,
  retainedGamesPerSeries: 2,
  retainedSeriesPerPeriod: 1,
} as const;
