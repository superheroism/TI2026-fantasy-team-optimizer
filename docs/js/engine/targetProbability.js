import { DEFAULT_LAYOUT_ID } from '../domain/rules.js';
import { bannerMechanicsKey, boardMechanicsKey } from './bannerMechanics.js';
import { mean, percentile } from './distributions.js';
import { rankTeamsForRole } from './scoring.js';
import { choosePreparedTargetSearch, chooseTargetSearch, getTargetSearchDiagnostics, prepareTargetCandidates, resetTargetSearchDiagnostics, setTargetSearchDiagnosticsEnabled, } from './targetSearch.js';
import { recommendTitle, titlePrefixBoostPct } from './title.js';
const ROLES = ['core', 'mid', 'support'];
const ROLE_INDEX = { core: 0, mid: 1, support: 2 };
function newAdapterDiagnostics() {
    return {
        boardCacheHits: 0,
        boardCacheMisses: 0,
        boardCacheBypasses: 0,
        preparedRoleCacheHits: 0,
        preparedRoleCacheMisses: 0,
        searchCallsByTitlePrefix: {},
    };
}
let diagnosticsEnabled = false;
let adapterDiagnostics = newAdapterDiagnostics();
/** Enable/disable target benchmark diagnostics. Disabled by default in production. */
export function setTargetDiagnosticsEnabled(enabled) {
    diagnosticsEnabled = enabled;
    setTargetSearchDiagnosticsEnabled(enabled);
}
/** Clear accumulated diagnostic counters without touching optimization caches. */
export function resetTargetDiagnostics() {
    adapterDiagnostics = newAdapterDiagnostics();
    resetTargetSearchDiagnostics();
}
/** Return the Dota-facing target-search diagnostic shape used by engineering benchmarks. */
export function getTargetDiagnostics() {
    const search = getTargetSearchDiagnostics();
    return {
        ...adapterDiagnostics,
        searchCallsByTitlePrefix: { ...adapterDiagnostics.searchCallsByTitlePrefix },
        candidateSets: {
            core: search.candidateSets[0],
            mid: search.candidateSets[1],
            support: search.candidateSets[2],
        },
        candidatesBeforePruning: {
            core: search.candidatesBeforePruning[0],
            mid: search.candidatesBeforePruning[1],
            support: search.candidatesBeforePruning[2],
        },
        candidatesAfterPruning: {
            core: search.candidatesAfterPruning[0],
            mid: search.candidatesAfterPruning[1],
            support: search.candidatesAfterPruning[2],
        },
        prefixesConsidered: search.searchesConsidered,
        candidateCountSignatures: { ...search.candidateCountSignatures },
        uniquePreparedGroups: {
            core: search.uniquePreparedGroups[0],
            mid: search.uniquePreparedGroups[1],
            support: search.uniquePreparedGroups[2],
        },
        uniquePreparedGroupTuples: search.uniquePreparedGroupTuples,
        reusedPreparedGroupTuples: search.reusedPreparedGroupTuples,
        uniquePreparedGroupPairs: {
            coreMid: search.uniquePreparedGroupPairs[0],
            midSupport: search.uniquePreparedGroupPairs[1],
            coreSupport: search.uniquePreparedGroupPairs[2],
        },
        reusedPreparedGroupPairs: {
            coreMid: search.reusedPreparedGroupPairs[0],
            midSupport: search.reusedPreparedGroupPairs[1],
            coreSupport: search.reusedPreparedGroupPairs[2],
        },
        prefixBoundPruned: search.searchBoundPruned,
        coreBranchesConsidered: search.firstBranchesConsidered,
        coreBranchesPruned: search.firstBranchesPruned,
        pairBranchesConsidered: search.pairBranchesConsidered,
        pairBranchesPruned: search.pairBranchesPruned,
        triplesConsidered: search.triplesConsidered,
        triplesCompleted: search.triplesCompleted,
        triplesEarlyTerminated: search.triplesEarlyTerminated,
        scenarioChecks: search.scenarioChecks,
        prefixScenarioChecks: search.searchScenarioChecks,
        seedScenarioChecks: search.seedScenarioChecks,
        coreScenarioChecks: search.firstScenarioChecks,
        pairScenarioChecks: search.pairScenarioChecks,
        tripleScenarioChecks: search.tripleScenarioChecks,
        survivingPairSampleBuilds: search.survivingPairSampleBuilds,
        thirdCandidatesVisited: search.thirdCandidatesVisited,
        maxThirdCandidatesVisited: search.maxThirdCandidatesVisited,
        candidatePreparationMs: search.candidatePreparationMs,
        combinatorialSearchMs: search.combinatorialSearchMs,
    };
}
const targetChoiceCache = new WeakMap();
const preparedRoleCache = new WeakMap();
function searchCandidate(candidate) {
    return {
        payload: candidate.row,
        expected: candidate.row.expected,
        samples: candidate.row.samples,
        scale: 1 + candidate.boostPct / 100,
    };
}
function rosterFromSelected(selected) {
    return {
        core: [selected[0]],
        mid: [selected[1]],
        support: [selected[2]],
    };
}
/** Public Dota-facing helper retained for exact synthetic regression tests. */
export function chooseTargetRoster(candidates, targetScore, iterations) {
    const choice = chooseTargetSearch([
        candidates.core.map(searchCandidate),
        candidates.mid.map(searchCandidate),
        candidates.support.map(searchCandidate),
    ], targetScore, iterations);
    if (!choice)
        return undefined;
    return {
        probability: choice.probability,
        expected: choice.expected,
        roster: rosterFromSelected(choice.selected),
        samples: choice.samples,
    };
}
function preparedRoleCandidates(role, board, data, prefixId, iterations) {
    let cache = preparedRoleCache.get(data);
    if (!cache) {
        cache = new Map();
        preparedRoleCache.set(data, cache);
    }
    const banner = board[role];
    const key = JSON.stringify([
        bannerMechanicsKey(banner, board.layoutId ?? DEFAULT_LAYOUT_ID),
        prefixId ?? null,
        iterations,
    ]);
    const prior = cache.get(key);
    if (prior) {
        if (diagnosticsEnabled)
            adapterDiagnostics.preparedRoleCacheHits++;
        return prior;
    }
    if (diagnosticsEnabled)
        adapterDiagnostics.preparedRoleCacheMisses++;
    const ranked = rankTeamsForRole(role, board, data, iterations);
    const candidates = ranked.map((row) => searchCandidate({
        row,
        boostPct: prefixId === undefined
            ? 0
            : titlePrefixBoostPct(data.titles, role, row.team, prefixId),
    }));
    const prepared = prepareTargetCandidates(candidates, iterations, ROLE_INDEX[role]);
    cache.set(key, prepared);
    return prepared;
}
function optimizeTargetBoard(board, data, targetScore, iterations, useBoardCache = true) {
    let cache;
    let key;
    if (useBoardCache) {
        cache = targetChoiceCache.get(data);
        if (!cache) {
            cache = new Map();
            targetChoiceCache.set(data, cache);
        }
        key = JSON.stringify([
            boardMechanicsKey(board),
            targetScore,
            iterations,
        ]);
        const cached = cache.get(key);
        if (cached) {
            if (diagnosticsEnabled)
                adapterDiagnostics.boardCacheHits++;
            return cached;
        }
        if (diagnosticsEnabled)
            adapterDiagnostics.boardCacheMisses++;
    }
    else if (diagnosticsEnabled) {
        adapterDiagnostics.boardCacheBypasses++;
    }
    const prefixIds = data.titles.prefixes.length
        ? data.titles.prefixes.map((prefix) => prefix.id)
        : [undefined];
    let best;
    for (const prefixId of prefixIds) {
        if (diagnosticsEnabled) {
            const diagnosticPrefix = prefixId ?? '(none)';
            adapterDiagnostics.searchCallsByTitlePrefix[diagnosticPrefix] =
                (adapterDiagnostics.searchCallsByTitlePrefix[diagnosticPrefix] ?? 0) + 1;
        }
        const prepared = [
            preparedRoleCandidates('core', board, data, prefixId, iterations),
            preparedRoleCandidates('mid', board, data, prefixId, iterations),
            preparedRoleCandidates('support', board, data, prefixId, iterations),
        ];
        const choice = choosePreparedTargetSearch(prepared, targetScore, iterations, best?.hits ?? -1, best?.expected ?? -Infinity);
        if (!choice)
            continue;
        best = {
            hits: choice.hits,
            probability: choice.probability,
            expected: choice.expected,
            roster: rosterFromSelected(choice.selected),
            samples: choice.samples,
            ...(prefixId !== undefined ? { prefixId } : {}),
        };
    }
    if (best && cache && key !== undefined)
        cache.set(key, best);
    return best;
}
/** Fast scalar target utility for descriptive-board callers. */
export function evaluateBoardTargetProbabilityFast(board, data, targetScore, iterations = data.simulation.optimizerIterations) {
    return optimizeTargetBoard(board, data, targetScore, iterations, true)?.probability ?? 0;
}
/**
 * Exact scalar target utility for callers that already own a canonical outer memo.
 * Lower-level role/scenario caches remain active; only the redundant whole-board choice cache is bypassed.
 */
export function evaluateBoardTargetProbabilityFastUncached(board, data, targetScore, iterations = data.simulation.optimizerIterations) {
    return optimizeTargetBoard(board, data, targetScore, iterations, false)?.probability ?? 0;
}
/**
 * Full terminal evaluation for target-probability mode. Free roster and title
 * prefix are selected by target probability itself.
 */
export function evaluateBoardTarget(board, username, data, targetScore, iterations = data.simulation.optimizerIterations) {
    const choice = optimizeTargetBoard(board, data, targetScore, iterations, true);
    if (!choice) {
        throw new Error('No complete legal Core/Mid/Support roster is available for target-probability evaluation.');
    }
    const title = recommendTitle(username, choice.roster, data.titles, choice.prefixId);
    return {
        expected: mean(choice.samples),
        median: percentile(choice.samples, 0.5),
        p10: percentile(choice.samples, 0.1),
        p90: percentile(choice.samples, 0.9),
        targetProbability: choice.probability,
        samples: choice.samples,
        roster: choice.roster,
        title,
        modelingMode: 'distribution_aware_proxy',
        confidence: data.isDemo ? 'low' : 'medium',
    };
}
//# sourceMappingURL=targetProbability.js.map