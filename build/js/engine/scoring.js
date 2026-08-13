import { correlatedUniforms, SeededRandom } from './random.js';
import { mean, percentile, quantileValue } from './distributions.js';
import { recommendTitle } from './title.js';
const ROLES = ['core', 'mid', 'support'];
const sampleCache = new WeakMap();
const rankingCache = new WeakMap();
function hashString(value) {
    let h = 2166136261;
    for (let i = 0; i < value.length; i++) {
        h ^= value.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** ScriptsBits stores Spearman rho; its Gaussian-copula implementation maps rho_s to latent Gaussian rho. */
export function spearmanToGaussian(rho) {
    return Math.max(-0.98, Math.min(0.98, 2 * Math.sin(Math.PI * rho / 6)));
}
export function selectedCorrelation(role, stats, data) {
    const model = data.roleCorrelations[role];
    return stats.map((a, i) => stats.map((b, j) => {
        if (i === j)
            return 1;
        const ai = model.stats.indexOf(a), bi = model.stats.indexOf(b);
        if (ai < 0 || bi < 0)
            return 0;
        return spearmanToGaussian(model.spearman[ai]?.[bi] ?? 0);
    }));
}
/**
 * Apply the verified client retention rule to already-computed per-game role scores.
 * Each inner array is one series. Keep top N games in each series, then best N series.
 * TI 2026 V1 config is N_games=2 and N_series=1.
 */
export function retainRoleScore(seriesGames, scoring) {
    const seriesScores = seriesGames.map(games => [...games].sort((a, b) => b - a)
        .slice(0, scoring.retainedGamesPerSeries).reduce((a, b) => a + b, 0));
    return seriesScores.sort((a, b) => b - a).slice(0, scoring.retainedSeries).reduce((a, b) => a + b, 0);
}
function profileSupportsBanner(profile, banner) {
    return banner.emblems.every(e => profile.statQuantiles[e.stat]?.length);
}
function effectiveGames(profile, banner) {
    const values = banner.emblems.map(e => profile.effectiveGamesByStat?.[e.stat]).filter((x) => Number.isFinite(x));
    return values.length ? Math.min(...values) : undefined;
}
export function simulateRoleTeam(profile, banner, data, iterations = data.simulation.iterations, seedOffset = 0) {
    if (!profileSupportsBanner(profile, banner))
        return new Array(iterations).fill(0);
    let cache = sampleCache.get(data);
    if (!cache) {
        cache = new Map();
        sampleCache.set(data, cache);
    }
    const stats = banner.emblems.map(e => e.stat);
    const corr = selectedCorrelation(banner.role, stats, data);
    const key = JSON.stringify({ p: profile.id, b: banner.emblems.map(e => [e.stat, e.multiplierPct]), n: iterations, s: banner.expectedSeries, c: corr, r: data.simulation.scoring, z: data.simulation.seed + seedOffset });
    const cached = cache.get(key);
    if (cached)
        return cached;
    const rng = new SeededRandom((data.simulation.seed + hashString(key) + seedOffset) >>> 0);
    const scoring = data.simulation.scoring;
    const out = new Array(iterations);
    for (let iter = 0; iter < iterations; iter++) {
        const seriesGames = [];
        for (let s = 0; s < banner.expectedSeries; s++) {
            const gameCount = 2 + (rng.uniform() < scoring.thirdGameProbability ? 1 : 0);
            const games = [];
            for (let g = 0; g < gameCount; g++) {
                const u = correlatedUniforms(rng, corr);
                let gameScore = 0;
                for (let i = 0; i < 3; i++) {
                    const emblem = banner.emblems[i];
                    const raw = quantileValue(profile.statQuantiles[emblem.stat], u[i] ?? 0.5);
                    gameScore += raw * (emblem.multiplierPct / 100);
                }
                games.push(gameScore);
            }
            seriesGames.push(games);
        }
        out[iter] = retainRoleScore(seriesGames, scoring);
    }
    cache.set(key, out);
    return out;
}
function scoreProfile(profile, banner, data, iterations, seedOffset = 0) {
    const samples = simulateRoleTeam(profile, banner, data, iterations, seedOffset);
    const row = { playerId: profile.id, name: profile.name, team: profile.team, attachedPlayers: profile.attachedPlayers, expected: mean(samples), samples };
    const e = effectiveGames(profile, banner);
    if (e !== undefined)
        row.effectiveGames = e;
    return row;
}
export function rankTeamsForRole(role, board, data, iterations = data.simulation.rankingIterations) {
    let cache = rankingCache.get(data);
    if (!cache) {
        cache = new Map();
        rankingCache.set(data, cache);
    }
    const key = JSON.stringify({ role, b: board[role], n: iterations });
    const cached = cache.get(key);
    if (cached)
        return cached;
    const rows = data.players.filter(p => p.role === role && profileSupportsBanner(p, board[role]))
        .map((p, i) => scoreProfile(p, board[role], data, iterations, 10_007 * (i + 1)))
        .sort((a, b) => b.expected - a.expected);
    cache.set(key, rows);
    return rows;
}
function selectedProfile(role, banner, data) {
    return data.players.find(p => p.role === role && p.team === banner.selectedTeam)
        ?? data.players.find(p => p.role === role);
}
function combineRoleSamples(roster, iterations) {
    const out = new Array(iterations).fill(0);
    for (const role of ROLES) {
        // V1 atomic roster unit is already the fixed Core pair, Mid player, or Support pair.
        const row = roster[role][0];
        if (!row)
            continue;
        for (let i = 0; i < iterations; i++)
            out[i] = (out[i] ?? 0) + (row.samples[i] ?? row.expected);
    }
    return out;
}
function buildEvaluation(roster, samples, username, data, targetScore) {
    const triggerMap = new Map(data.players.map(p => [p.id, p.titleTriggerRates]));
    const title = recommendTitle(username, roster, data.titles, triggerMap);
    // V1 ScriptsBits adapter has no title trigger distribution, so title EV is zero. If a later
    // bundle supplies calibrated title data, this proportional adjustment preserves compatibility.
    const baseMean = mean(samples), factor = baseMean > 0 ? 1 + title.expectedBonus / baseMean : 1;
    const adjusted = factor === 1 ? samples : samples.map(x => x * factor);
    const result = {
        expected: mean(adjusted), median: percentile(adjusted, .5), p10: percentile(adjusted, .1), p90: percentile(adjusted, .9),
        samples: adjusted, roster, title, modelingMode: 'distribution_aware_proxy', confidence: data.isDemo ? 'low' : 'medium'
    };
    if (targetScore !== undefined)
        result.targetProbability = adjusted.filter(x => x >= targetScore).length / Math.max(adjusted.length, 1);
    return result;
}
/** Evaluate exactly the teams selected by the user, mirroring the ScriptsBits setup view. */
export function evaluateSelectedBoard(board, username, data, targetScore) {
    const n = data.simulation.iterations;
    const roster = { core: [], mid: [], support: [] };
    ROLES.forEach((role, i) => {
        const p = selectedProfile(role, board[role], data);
        if (p)
            roster[role] = [scoreProfile(p, board[role], data, n, 50_021 * (i + 1))];
    });
    return buildEvaluation(roster, combineRoleSamples(roster, n), username, data, targetScore);
}
/**
 * Terminal board evaluator used by the stochastic action engine. Team selection is free, so it
 * re-optimizes the team independently for Core, Mid and Support after every hypothetical board.
 */
export function evaluateBoard(board, username, data, targetScore) {
    const n = data.simulation.optimizerIterations;
    const roster = { core: [], mid: [], support: [] };
    for (const role of ROLES) {
        const ranked = rankTeamsForRole(role, board, data, n);
        if (ranked[0])
            roster[role] = [ranked[0]];
    }
    return buildEvaluation(roster, combineRoleSamples(roster, n), username, data, targetScore);
}
//# sourceMappingURL=scoring.js.map