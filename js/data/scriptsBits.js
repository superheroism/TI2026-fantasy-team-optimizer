import { attachedPlayers, teamRoleLabel } from './ti2026Rosters.js';
import { TI2026_TITLE_CATALOG } from './titleBoosts.js';
export const LOCAL_STATISTICAL_MODEL_URL = './data/ti2026-statistical-model.json';
const ROLE_SOURCE = { core: 'Core', mid: 'Mid', support: 'Support' };
const COLOR_MAP = { red: 'red', green: 'green', blue: 'blue' };
const aliases = {
    'Creep Score': ['creep score', 'creep_score'], GPM: ['gpm'], Deaths: ['deaths'], 'Tower Kills': ['tower kills', 'tower_kills'], Madstone: ['madstone', 'madstone collected', 'madstone_collected'], Kills: ['kills'],
    'Teamfight Participation': ['teamfight participation', 'teamfight_participation'], 'Tormentor Kills': ['tormentor kills', 'tormentor_kills'], 'Roshan Kills': ['roshan kills', 'roshan_kills'], Stuns: ['stuns'], 'Courier Kills': ['courier kills', 'courier_kills'], 'First Blood': ['first blood', 'first_blood'],
    Runes: ['runes', 'runes grabbed', 'runes_grabbed'], Watchers: ['watchers', 'watchers taken', 'watchers_taken'], 'Wards Placed': ['wards placed', 'observer wards placed', 'observer ward placed', 'obs placed', 'obs_placed', 'wards_placed'], 'Smokes Used': ['smokes used', 'smokes_used'], 'Camps Stacked': ['camps stacked', 'camps_stacked'], Lotuses: ['lotuses', 'lotuses grabbed', 'lotuses_grabbed']
};
function norm(s) { return s.toLowerCase().replace(/[^a-z0-9]/g, ''); }
function canonicalStat(...candidates) {
    const normalized = candidates.map(norm);
    return Object.keys(aliases).find(k => aliases[k].some(a => normalized.includes(norm(a))));
}
function colorOf(c) { return COLOR_MAP[c.toLowerCase()] ?? 'red'; }
function parseRawHtml(html) {
    const m = html.match(/<script[^>]*id=["']calcdata["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!m?.[1])
        throw new Error('ScriptsBits calcdata payload was not found.');
    return JSON.parse(m[1]);
}
export function convertScriptsBits(raw) {
    const levels = raw.levels.map(x => x / 100);
    const players = [];
    const roleCorrelations = {};
    ['core', 'mid', 'support'].forEach(role => {
        const sr = ROLE_SOURCE[role], r = raw.roles[sr];
        const sourceToCanonical = new Map();
        r.stats.forEach(s => { const c = canonicalStat(s.k, s.l); if (c)
            sourceToCanonical.set(s.k, c); });
        r.teams.forEach(team => {
            const statQuantiles = {};
            const effectiveGamesByStat = {};
            for (const [sourceKey, byTeam] of Object.entries(r.cells)) {
                const stat = sourceToCanonical.get(sourceKey);
                const cell = byTeam[team];
                if (!stat || !cell)
                    continue;
                statQuantiles[stat] = cell.q.map((value, i) => ({ q: levels[i] ?? i / Math.max(cell.q.length - 1, 1), value }));
                effectiveGamesByStat[stat] = cell.e;
            }
            players.push({ id: `${role}:${team}`, name: teamRoleLabel(team, role), team, role, attachedPlayers: attachedPlayers(team, role), statQuantiles, effectiveGamesByStat });
        });
        const corr = raw.gcorr[sr];
        const corrStats = [];
        const sourceIndices = [];
        corr.stats.forEach((k, i) => { const c = sourceToCanonical.get(k); if (c) {
            corrStats.push(c);
            sourceIndices.push(i);
        } });
        const spearman = sourceIndices.map(i => sourceIndices.map(j => corr.m[i]?.[j] ?? 0));
        roleCorrelations[role] = { stats: corrStats, spearman };
    });
    // Fail loudly if an upstream schema/name change produced an unusable model. A zero-filled
    // simulation is much more misleading than a visible data-load error.
    for (const role of ['core', 'mid', 'support']) {
        const profiles = players.filter(p => p.role === role);
        if (!profiles.length)
            throw new Error(`Statistical dataset contains no ${role} team profiles.`);
        if (profiles.some(p => Object.keys(p.statQuantiles).length < 3)) {
            throw new Error(`Statistical dataset conversion produced incomplete ${role} stat profiles.`);
        }
        if (!roleCorrelations[role]?.stats.length)
            throw new Error(`Statistical dataset is missing ${role} correlations.`);
    }
    return {
        label: 'Precomputed recent-major team/role distributions', isDemo: false, sourceUrl: LOCAL_STATISTICAL_MODEL_URL, players,
        titles: TI2026_TITLE_CATALOG,
        simulation: { iterations: 20000, optimizerIterations: 48, rankingIterations: 6000, seed: 20260809, maxLookaheadTokens: 2, continuationOutcomeStrata: 8, continuationEntryStrata: 12, scoring: { retainedGamesPerSeries: 2, retainedSeries: 1, thirdGameProbability: 0.407 } },
        roleCorrelations
    };
}
export async function loadScriptsBitsData() {
    const response = await fetch(LOCAL_STATISTICAL_MODEL_URL, { cache: 'no-store' });
    if (!response.ok)
        throw new Error(`Local statistical model failed to load: ${response.status} ${response.statusText}`);
    const raw = await response.json();
    return convertScriptsBits(raw);
}
/** Exported for tests without exposing the source's raw stat-key naming to the rest of the app. */
export const scriptsBitsAdapterInternals = { canonicalStat, colorOf, parseRawHtml };
//# sourceMappingURL=scriptsBits.js.map