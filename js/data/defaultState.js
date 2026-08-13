import { BANNER_COLORS } from '../domain/rules.js';
import { ACTION_BY_ID, cloneAction } from './actionCatalog.js';
const defaults = {
    core: ['Creep Score', 'Teamfight Participation', 'GPM'],
    mid: ['Creep Score', 'Runes', 'Teamfight Participation'],
    support: ['Watchers', 'Teamfight Participation', 'Wards Placed']
};
const teamDefaults = { core: 'LGD Gaming', mid: 'Team Liquid', support: 'LGD Gaming' };
function emblem(role, position, color) { return { id: `${role}-${position}`, position, color, stat: defaults[role][position], qualityTier: 3, trait: 'Fractal' }; }
export const defaultBoard = Object.fromEntries(['core', 'mid', 'support'].map(role => [role, { role, selectedTeam: teamDefaults[role], expectedSeries: 5, emblems: BANNER_COLORS[role].map((c, i) => emblem(role, i, c)) }]));
const action = (id) => cloneAction(ACTION_BY_ID.get(id));
export const defaultMenu = [action('green-stat-all'), action('red-quality-all'), action('blue-trait-all')];
//# sourceMappingURL=defaultState.js.map