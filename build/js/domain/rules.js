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
const P = {
    core: {
        red: { 'Creep Score': 'S', GPM: 'S', Deaths: 'S', 'Tower Kills': 'B', Madstone: 'B', Kills: 'B' },
        green: { 'Teamfight Participation': 'S', 'Tormentor Kills': 'A', 'Roshan Kills': 'B', Stuns: 'C', 'First Blood': 'D', 'Courier Kills': 'D' },
    },
    mid: {
        red: { 'Creep Score': 'S', Deaths: 'S', GPM: 'S', Kills: 'B', Madstone: 'C', 'Tower Kills': 'C' },
        blue: { Runes: 'S', 'Camps Stacked': 'B', Watchers: 'B', Lotuses: 'B', 'Wards Placed': 'D', 'Smokes Used': 'D' },
        green: { 'Teamfight Participation': 'S', Stuns: 'B', 'Tormentor Kills': 'C', 'Roshan Kills': 'C', 'Courier Kills': 'D', 'First Blood': 'D' },
    },
    support: {
        blue: { Watchers: 'S', 'Wards Placed': 'A', 'Smokes Used': 'A', 'Camps Stacked': 'A', Lotuses: 'B', Runes: 'D' },
        green: { 'Teamfight Participation': 'S', Stuns: 'B', 'Courier Kills': 'C', 'First Blood': 'C', 'Tormentor Kills': 'D', 'Roshan Kills': 'D' },
    },
};
export function legalStats(color) { return LEGAL_STAT_POOLS[color]; }
export function priorityFor(role, color, stat) { return P[role]?.[color]?.[stat]; }
export function isLegalStat(color, stat) { return LEGAL_STAT_POOLS[color].includes(stat); }
//# sourceMappingURL=rules.js.map