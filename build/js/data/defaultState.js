import { BANNER_COLORS } from '../domain/rules.js';
const defaults = {
    core: ['Creep Score', 'Teamfight Participation', 'GPM'],
    mid: ['Creep Score', 'Runes', 'Teamfight Participation'],
    support: ['Watchers', 'Teamfight Participation', 'Wards Placed']
};
const teamDefaults = { core: 'LGD Gaming', mid: 'Team Liquid', support: 'LGD Gaming' };
function emblem(role, position, color) { return { id: `${role}-${position}`, position, color, stat: defaults[role][position], multiplierPct: 200, qualityTier: 3, trait: 'None', displayedActiveBonusPct: 0 }; }
export const defaultBoard = Object.fromEntries(['core', 'mid', 'support'].map(role => [role, { role, selectedTeam: teamDefaults[role], expectedSeries: 5, emblems: BANNER_COLORS[role].map((c, i) => emblem(role, i, c)) }]));
export const defaultMenu = [
    { id: 'op1', label: 'Reroll RED stat(s)', kind: 'stat_reroll', color: 'red', scope: 'all_matching', excludeCurrent: false },
    { id: 'op2', label: 'Reroll BLUE stat(s)', kind: 'stat_reroll', color: 'blue', scope: 'all_matching', excludeCurrent: false },
    { id: 'op3', label: 'Random quality increase', kind: 'quality_increase' }
];
//# sourceMappingURL=defaultState.js.map