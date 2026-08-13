export const LEGAL_STAT_POOLS = {
    red: ['Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills'],
    green: ['Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood'],
    blue: ['Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses'],
};
export const BANNER_COLORS = {
    core: ['red', 'green', 'red'],
    mid: ['red', 'blue', 'green'],
    support: ['blue', 'green', 'blue'],
};
export function legalStats(color) { return LEGAL_STAT_POOLS[color]; }
export function isLegalStat(color, stat) { return LEGAL_STAT_POOLS[color].includes(stat); }
//# sourceMappingURL=rules.js.map