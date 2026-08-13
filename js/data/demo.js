import { LEGAL_STAT_POOLS } from '../domain/rules.js';
import { TI2026_TITLE_CATALOG } from './titleBoosts.js';
const Q = [0.05, 0.25, 0.5, 0.75, 0.95];
function curve(base, volatility) { return Q.map((q, i) => ({ q, value: Math.max(0, base * (1 + volatility * ([-1.3, -0.55, 0, 0.55, 1.3][i]))) })); }
const roleBase = {
    core: { 'Creep Score': 950, GPM: 780, Deaths: 620, 'Tower Kills': 320, Madstone: 280, Kills: 380, 'Teamfight Participation': 720, 'Tormentor Kills': 380, 'Roshan Kills': 300, Stuns: 240, 'Courier Kills': 100, 'First Blood': 80 },
    mid: { 'Creep Score': 880, GPM: 720, Deaths: 580, 'Tower Kills': 280, Madstone: 240, Kills: 400, 'Teamfight Participation': 750, 'Tormentor Kills': 180, 'Roshan Kills': 180, Stuns: 400, 'Courier Kills': 100, 'First Blood': 80, Runes: 850, Watchers: 380, 'Wards Placed': 100, 'Smokes Used': 120, 'Camps Stacked': 400, Lotuses: 320 },
    support: { 'Teamfight Participation': 780, 'Tormentor Kills': 100, 'Roshan Kills': 100, Stuns: 450, 'Courier Kills': 280, 'First Blood': 250, Runes: 140, Watchers: 900, 'Wards Placed': 720, 'Smokes Used': 680, 'Camps Stacked': 600, Lotuses: 420 }
};
function profile(id, name, team, role, factor, vol) {
    const statQuantiles = {};
    const allowed = role === 'core' ? [...LEGAL_STAT_POOLS.red, ...LEGAL_STAT_POOLS.green] : role === 'mid' ? [...LEGAL_STAT_POOLS.red, ...LEGAL_STAT_POOLS.blue, ...LEGAL_STAT_POOLS.green] : [...LEGAL_STAT_POOLS.blue, ...LEGAL_STAT_POOLS.green];
    for (const stat of allowed) {
        const base = roleBase[role][stat] ?? 200;
        statQuantiles[stat] = curve(base * factor, vol);
    }
    return { id, name, team, role, attachedPlayers: [name], statQuantiles };
}
const players = [
    profile('core:A', 'Team A (Core Pair)', 'Team A', 'core', 1.08, .34), profile('core:B', 'Team B (Core Pair)', 'Team B', 'core', 1.02, .25), profile('core:C', 'Team C (Core Pair)', 'Team C', 'core', .96, .42),
    profile('mid:A', 'Team A (Mid)', 'Team A', 'mid', 1.09, .33), profile('mid:B', 'Team B (Mid)', 'Team B', 'mid', 1.03, .27), profile('mid:C', 'Team C (Mid)', 'Team C', 'mid', .97, .43),
    profile('support:A', 'Team A (Support Pair)', 'Team A', 'support', 1.07, .31), profile('support:B', 'Team B (Support Pair)', 'Team B', 'support', 1.03, .25), profile('support:C', 'Team C (Support Pair)', 'Team C', 'support', .99, .39)
];
const statLists = {
    core: ['Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills', 'Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood'],
    mid: ['Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills', 'Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses', 'Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood'],
    support: ['Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses', 'Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood']
};
function corr(stats, rho) { return { stats, spearman: stats.map((_, i) => stats.map((__, j) => i === j ? 1 : rho)) }; }
export const demoData = {
    label: 'Synthetic fallback dataset — ScriptsBits data not loaded', isDemo: true, players, titles: TI2026_TITLE_CATALOG,
    simulation: { iterations: 3000, optimizerIterations: 48, rankingIterations: 1000, seed: 20260811, maxLookaheadTokens: 1, continuationOutcomeStrata: 8, continuationEntryStrata: 12, scoring: { retainedGamesPerSeries: 2, retainedSeries: 1, thirdGameProbability: 0.407 } },
    roleCorrelations: { core: corr(statLists.core, .25), mid: corr(statLists.mid, .22), support: corr(statLists.support, .20) }
};
//# sourceMappingURL=demo.js.map