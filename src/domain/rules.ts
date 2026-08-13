import type { Role, SlotColor, StatName } from './types.js';

export const LEGAL_STAT_POOLS: Record<SlotColor, readonly StatName[]> = {
  red: ['Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills'],
  green: ['Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood'],
  blue: ['Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses'],
};

export const BANNER_COLORS: Record<Role, readonly [SlotColor, SlotColor, SlotColor]> = {
  core: ['red', 'green', 'red'],
  mid: ['red', 'blue', 'green'],
  support: ['blue', 'green', 'blue'],
};

export function legalStats(color: SlotColor): readonly StatName[] { return LEGAL_STAT_POOLS[color]; }
export function isLegalStat(color: SlotColor, stat: StatName): boolean { return LEGAL_STAT_POOLS[color].includes(stat); }
