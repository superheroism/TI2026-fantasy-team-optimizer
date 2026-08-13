import { cholesky, cholesky3, correlatedUniformsPrepared, normalCdf, SeededRandom } from './random.js';
import { mean, percentile, prepareQuantiles, quantileValuePrepared } from './distributions.js';
import { recommendTitle, titlePrefixBoostPct } from './title.js';
import { evaluateBanner } from '../domain/bannerEvaluator.js';
const ROLES = ['core', 'mid', 'support'];
const sampleCache = new WeakMap();
const rankingCache = new WeakMap();
const rawScenarioCache = new WeakMap();
const RAW_SCENARIO_MAX_ITERATIONS = 512;
const frontierCache = new WeakMap();
const expectedSampleCache = new WeakMap();
const sampleFrontierCache = new WeakMap();
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
function missingBannerStats(profile, banner) {
    return banner.emblems.map(e => e.stat).filter(stat => !profile.statQuantiles[stat]?.length);
}
function profileSupportsBanner(profile, banner) {
    return missingBannerStats(profile, banner).length === 0;
}
function effectiveGames(profile, banner) {
    const values = banner.emblems.map(e => profile.effectiveGamesByStat?.[e.stat]).filter((x) => Number.isFinite(x));
    return values.length ? Math.min(...values) : undefined;
}
function fullRoleGaussianCorrelation(role, data) {
    const model = data.roleCorrelations[role];
    return model.stats.map((_, i) => model.stats.map((__, j) => i === j ? 1 : spearmanToGaussian(model.spearman[i]?.[j] ?? 0)));
}
function rawRoleScenario(profile, banner, data, iterations, seedOffset) {
    let cache = rawScenarioCache.get(data);
    if (!cache) {
        cache = new Map();
        rawScenarioCache.set(data, cache);
    }
    const model = data.roleCorrelations[banner.role], stats = model.stats;
    const key = JSON.stringify({ p: profile.id, r: banner.role, n: iterations, s: banner.expectedSeries, z: data.simulation.seed + seedOffset, g: data.simulation.scoring.thirdGameProbability });
    const prior = cache.get(key);
    if (prior)
        return prior;
    const statCount = stats.length, statIndex = new Map(stats.map((x, i) => [x, i]));
    const totalGames = iterations * banner.expectedSeries * 3;
    const values = new Float64Array(totalGames * statCount), third = new Uint8Array(iterations * banner.expectedSeries);
    const rng = new SeededRandom((data.simulation.seed + hashString(key) + seedOffset) >>> 0);
    const L = cholesky(fullRoleGaussianCorrelation(banner.role, data));
    const prepared = stats.map(stat => prepareQuantiles(profile.statQuantiles[stat]));
    const z = new Float64Array(statCount), x = new Float64Array(statCount);
    for (let iter = 0; iter < iterations; iter++) {
        for (let series = 0; series < banner.expectedSeries; series++) {
            const si = iter * banner.expectedSeries + series;
            third[si] = rng.uniform() < data.simulation.scoring.thirdGameProbability ? 1 : 0;
            for (let game = 0; game < 3; game++) {
                for (let j = 0; j < statCount; j++)
                    z[j] = rng.normal();
                for (let i = 0; i < statCount; i++) {
                    let latent = 0;
                    for (let j = 0; j <= i; j++)
                        latent += (L[i]?.[j] ?? 0) * z[j];
                    x[i] = normalCdf(latent);
                }
                const base = ((si * 3 + game) * statCount);
                for (let j = 0; j < statCount; j++)
                    values[base + j] = quantileValuePrepared(prepared[j], x[j]);
            }
        }
    }
    const out = { stats, statIndex, values, third, iterations, series: banner.expectedSeries, statCount };
    cache.set(key, out);
    return out;
}
function scoreFromRawScenario(scenario, banner, mult) {
    const indices = banner.emblems.map(e => scenario.statIndex.get(e.stat) ?? -1);
    if (indices.some(i => i < 0))
        throw new Error(`Role scenario is missing one or more selected stats.`);
    const out = new Array(scenario.iterations), { values, third, statCount } = scenario;
    for (let iter = 0; iter < scenario.iterations; iter++) {
        let best = -Infinity;
        for (let series = 0; series < scenario.series; series++) {
            const si = iter * scenario.series + series;
            let a = 0, b = 0, c = 0;
            for (let game = 0; game < 3; game++) {
                const base = (si * 3 + game) * statCount;
                const score = values[base + indices[0]] * mult[0] + values[base + indices[1]] * mult[1] + values[base + indices[2]] * mult[2];
                if (game === 0)
                    a = score;
                else if (game === 1)
                    b = score;
                else
                    c = score;
            }
            const seriesScore = third[si] ? a + b + c - Math.min(a, b, c) : a + b;
            if (seriesScore > best)
                best = seriesScore;
        }
        out[iter] = best;
    }
    return out;
}
function meanFromRawScenario(scenario, banner, mult) {
    const indices = banner.emblems.map(e => scenario.statIndex.get(e.stat) ?? -1);
    if (indices.some(i => i < 0))
        throw new Error(`Role scenario is missing one or more selected stats.`);
    const { values, third, statCount } = scenario;
    let total = 0;
    for (let iter = 0; iter < scenario.iterations; iter++) {
        let best = -Infinity;
        for (let series = 0; series < scenario.series; series++) {
            const si = iter * scenario.series + series;
            let a = 0, b = 0, c = 0;
            for (let game = 0; game < 3; game++) {
                const base = (si * 3 + game) * statCount;
                const score = values[base + indices[0]] * mult[0] + values[base + indices[1]] * mult[1] + values[base + indices[2]] * mult[2];
                if (game === 0)
                    a = score;
                else if (game === 1)
                    b = score;
                else
                    c = score;
            }
            const seriesScore = third[si] ? a + b + c - Math.min(a, b, c) : a + b;
            if (seriesScore > best)
                best = seriesScore;
        }
        total += best;
    }
    return total / Math.max(scenario.iterations, 1);
}
function simulateRoleTeamExpected(profile, banner, data, iterations, seedOffset) {
    let cache = expectedSampleCache.get(data);
    if (!cache) {
        cache = new Map();
        expectedSampleCache.set(data, cache);
    }
    const evaluated = evaluateBanner(banner), mult = evaluated.map(x => x.effectiveMultiplierPct / 100);
    const key = JSON.stringify({ p: profile.id, b: banner.emblems.map((e, i) => [e.stat, e.qualityTier, e.trait, evaluated[i].effectiveMultiplierPct]), n: iterations, s: banner.expectedSeries, z: data.simulation.seed + seedOffset });
    const prior = cache.get(key);
    if (prior !== undefined)
        return prior;
    let result;
    if (iterations <= RAW_SCENARIO_MAX_ITERATIONS && data.simulation.scoring.retainedGamesPerSeries === 2 && data.simulation.scoring.retainedSeries === 1) {
        result = meanFromRawScenario(rawRoleScenario(profile, banner, data, iterations, seedOffset), banner, mult);
    }
    else
        result = mean(simulateRoleTeam(profile, banner, data, iterations, seedOffset));
    cache.set(key, result);
    return result;
}
export function simulateRoleTeam(profile, banner, data, iterations = data.simulation.iterations, seedOffset = 0) {
    const missing = missingBannerStats(profile, banner);
    if (missing.length)
        throw new Error(`${profile.name} is missing statistical model data for: ${missing.join(', ')}.`);
    let cache = sampleCache.get(data);
    if (!cache) {
        cache = new Map();
        sampleCache.set(data, cache);
    }
    const stats = banner.emblems.map(e => e.stat);
    const corr = selectedCorrelation(banner.role, stats, data);
    const evaluatedBanner = evaluateBanner(banner);
    // Random scenarios depend on team/role/stat structure, not quality/trait multipliers. Keeping
    // the seed stable across multiplier-only changes acts as common random numbers and reduces
    // action-comparison Monte Carlo noise.
    const key = JSON.stringify({ p: profile.id, b: banner.emblems.map((e, i) => [e.stat, e.qualityTier, e.trait, evaluatedBanner[i].effectiveMultiplierPct]), n: iterations, s: banner.expectedSeries, c: corr, r: data.simulation.scoring, z: data.simulation.seed + seedOffset });
    const cached = cache.get(key);
    if (cached)
        return cached;
    const scenarioKey = JSON.stringify({ p: profile.id, stats, n: iterations, s: banner.expectedSeries, c: corr, r: data.simulation.scoring, z: data.simulation.seed + seedOffset });
    const rng = new SeededRandom((data.simulation.seed + hashString(scenarioKey) + seedOffset) >>> 0);
    const scoring = data.simulation.scoring;
    const L = cholesky3(corr);
    const prepared = stats.map(stat => prepareQuantiles(profile.statQuantiles[stat]));
    const mult = evaluatedBanner.map(x => x.effectiveMultiplierPct / 100);
    if (iterations <= RAW_SCENARIO_MAX_ITERATIONS && scoring.retainedGamesPerSeries === 2 && scoring.retainedSeries === 1) {
        const out = scoreFromRawScenario(rawRoleScenario(profile, banner, data, iterations, seedOffset), banner, mult);
        cache.set(key, out);
        return out;
    }
    const out = new Array(iterations);
    // Specialized TI-2026 retention kernel: top 2 games per series, then best series.
    // Avoids thousands of short-lived arrays and sorts per team/banner simulation.
    const topTwo = scoring.retainedGamesPerSeries === 2 && scoring.retainedSeries === 1;
    for (let iter = 0; iter < iterations; iter++) {
        if (topTwo) {
            let bestSeries = -Infinity;
            for (let s = 0; s < banner.expectedSeries; s++) {
                const gameCount = 2 + (rng.uniform() < scoring.thirdGameProbability ? 1 : 0);
                let a = 0, b = 0, c = 0;
                for (let g = 0; g < gameCount; g++) {
                    const u = correlatedUniformsPrepared(rng, L);
                    const score = quantileValuePrepared(prepared[0], u[0]) * mult[0]
                        + quantileValuePrepared(prepared[1], u[1]) * mult[1]
                        + quantileValuePrepared(prepared[2], u[2]) * mult[2];
                    if (g === 0)
                        a = score;
                    else if (g === 1)
                        b = score;
                    else
                        c = score;
                }
                const seriesScore = gameCount === 2 ? a + b : a + b + c - Math.min(a, b, c);
                if (seriesScore > bestSeries)
                    bestSeries = seriesScore;
            }
            out[iter] = bestSeries;
        }
        else {
            const seriesGames = [];
            for (let s = 0; s < banner.expectedSeries; s++) {
                const gameCount = 2 + (rng.uniform() < scoring.thirdGameProbability ? 1 : 0), games = [];
                for (let g = 0; g < gameCount; g++) {
                    const u = correlatedUniformsPrepared(rng, L);
                    games.push(quantileValuePrepared(prepared[0], u[0]) * mult[0]
                        + quantileValuePrepared(prepared[1], u[1]) * mult[1]
                        + quantileValuePrepared(prepared[2], u[2]) * mult[2]);
                }
                seriesGames.push(games);
            }
            out[iter] = retainRoleScore(seriesGames, scoring);
        }
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
    const banner = board[role];
    // Team choice does not change a banner's underlying team-by-team role distributions. Excluding
    // selectedTeam lets the Likely Results comparison remain cached and instantly re-highlight when
    // the user switches teams without changing stats/tiers/traits/series.
    const key = JSON.stringify({ role, b: { role: banner.role, emblems: banner.emblems, expectedSeries: banner.expectedSeries }, n: iterations });
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
    return data.players.find(p => p.role === role && p.team === banner.selectedTeam);
}
function combineRoleSamplesWithTitle(roster, iterations, title) {
    const out = new Array(iterations).fill(0);
    for (const role of ROLES) {
        const row = roster[role][0];
        if (!row)
            continue;
        const factor = 1 + (title.roleBoostPct[role] ?? 0) / 100;
        for (let i = 0; i < iterations; i++)
            out[i] = (out[i] ?? 0) + (row.samples[i] ?? row.expected) * factor;
    }
    return out;
}
function buildEvaluation(roster, username, data, targetScore, forcedPrefixId) {
    const title = recommendTitle(username, roster, data.titles, forcedPrefixId);
    const iterations = Math.max(...ROLES.map(role => roster[role][0]?.samples.length ?? 0), 1);
    const adjusted = combineRoleSamplesWithTitle(roster, iterations, title);
    const result = {
        expected: mean(adjusted), median: percentile(adjusted, .5), p10: percentile(adjusted, .1), p90: percentile(adjusted, .9),
        samples: adjusted, roster, title, modelingMode: 'distribution_aware_proxy', confidence: data.isDemo ? 'low' : 'medium'
    };
    if (targetScore !== undefined)
        result.targetProbability = adjusted.filter(x => x >= targetScore).length / Math.max(adjusted.length, 1);
    return result;
}
export function rolePrefixFrontier(role, banner, data, iterations = data.simulation.optimizerIterations) {
    let cache = frontierCache.get(data);
    if (!cache) {
        cache = new Map();
        frontierCache.set(data, cache);
    }
    const key = JSON.stringify({ role, b: banner, n: iterations });
    const prior = cache.get(key);
    if (prior)
        return prior;
    const profiles = data.players.filter(p => p.role === role && profileSupportsBanner(p, banner));
    const ranked = profiles.map((p, i) => ({ playerId: p.id, name: p.name, team: p.team, attachedPlayers: p.attachedPlayers, expected: simulateRoleTeamExpected(p, banner, data, iterations, 10_007 * (i + 1)), samples: [] }));
    const out = [];
    for (const prefix of data.titles.prefixes) {
        let best, bestAdjusted = -Infinity, bestPct = 0;
        for (const row of ranked) {
            const pct = titlePrefixBoostPct(data.titles, role, row.team, prefix.id), adjusted = row.expected * (1 + pct / 100);
            if (adjusted > bestAdjusted) {
                best = row;
                bestAdjusted = adjusted;
                bestPct = pct;
            }
        }
        if (best)
            out.push({ prefixId: prefix.id, adjustedExpected: bestAdjusted, row: best, boostPct: bestPct });
    }
    cache.set(key, out);
    return out;
}
/** Fast scalar evaluator for optimizer search. It is mathematically equivalent for expected-score
 * utility to full board evaluation, but composes cached per-role/per-prefix frontiers instead of
 * rebuilding roster/title/sample objects for every terminal board combination. */
export function evaluateBoardExpectedFast(board, data, iterations = data.simulation.optimizerIterations) {
    const frontiers = {
        core: rolePrefixFrontier('core', board.core, data, iterations),
        mid: rolePrefixFrontier('mid', board.mid, data, iterations),
        support: rolePrefixFrontier('support', board.support, data, iterations),
    };
    let best = -Infinity;
    for (const prefix of data.titles.prefixes) {
        let total = 0, complete = true;
        for (const role of ROLES) {
            const entry = frontiers[role].find(x => x.prefixId === prefix.id);
            if (!entry) {
                complete = false;
                break;
            }
            total += entry.adjustedExpected;
        }
        if (complete && total > best)
            best = total;
    }
    if (Number.isFinite(best))
        return best;
    return ROLES.reduce((sum, role) => sum + (rankTeamsForRole(role, board, data, iterations)[0]?.expected ?? 0), 0);
}
function titleAwareBestRoster(board, data, iterations) {
    const ranked = {
        core: rankTeamsForRole('core', board, data, iterations),
        mid: rankTeamsForRole('mid', board, data, iterations),
        support: rankTeamsForRole('support', board, data, iterations),
    };
    let bestTotal = -Infinity;
    let bestPrefixId;
    let bestRoster = { core: [], mid: [], support: [] };
    for (const prefix of data.titles.prefixes) {
        const candidate = { core: [], mid: [], support: [] };
        let total = 0;
        for (const role of ROLES) {
            let best, bestAdjusted = -Infinity;
            for (const row of ranked[role]) {
                const pct = titlePrefixBoostPct(data.titles, role, row.team, prefix.id);
                const adjusted = row.expected * (1 + pct / 100);
                if (adjusted > bestAdjusted) {
                    bestAdjusted = adjusted;
                    best = row;
                }
            }
            if (best) {
                candidate[role] = [best];
                total += bestAdjusted;
            }
        }
        if (total > bestTotal) {
            bestTotal = total;
            bestPrefixId = prefix.id;
            bestRoster = candidate;
        }
    }
    if (bestPrefixId === undefined) {
        for (const role of ROLES)
            if (ranked[role][0])
                bestRoster[role] = [ranked[role][0]];
    }
    return { roster: bestRoster, ...(bestPrefixId !== undefined ? { prefixId: bestPrefixId } : {}) };
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
    return buildEvaluation(roster, username, data, targetScore);
}
/**
 * Terminal board evaluator used by the stochastic action engine. Team selection is free, so it
 * re-optimizes the team independently for Core, Mid and Support after every hypothetical board.
 */
export function evaluateBoard(board, username, data, targetScore) {
    const n = data.simulation.optimizerIterations;
    const optimized = titleAwareBestRoster(board, data, n);
    return buildEvaluation(optimized.roster, username, data, targetScore, optimized.prefixId);
}
//# sourceMappingURL=scoring.js.map