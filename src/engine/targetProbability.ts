import type {
  BoardEvaluation,
  BoardState,
  DataBundle,
  PlayerScore,
  Role,
} from '../domain/types.js';

import { bannerMechanicsKey, boardMechanicsKey } from './bannerMechanics.js';
import { mean, percentile } from './distributions.js';
import { rankTeamsForRole } from './scoring.js';
import {
  choosePreparedTargetSearch,
  chooseTargetSearch,
  getTargetSearchDiagnostics,
  prepareTargetCandidates,
  resetTargetSearchDiagnostics,
  setTargetSearchDiagnosticsEnabled,
} from './targetSearch.js';
import type {
  PreparedTargetSearchCandidate,
  PreparedTargetSearchGroups,
  TargetSearchCandidate,
} from './targetSearch.js';
import { recommendTitle, titlePrefixBoostPct } from './title.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const ROLE_INDEX: Record<Role, 0 | 1 | 2> = { core: 0, mid: 1, support: 2 };

export interface TargetCandidate {
  row: PlayerScore;
  boostPct: number;
}

export interface TargetRosterChoice {
  probability: number;
  expected: number;
  roster: {
    core: PlayerScore[];
    mid: PlayerScore[];
    support: PlayerScore[];
  };
  samples: number[];
}

interface TargetBoardChoice extends TargetRosterChoice {
  hits: number;
  prefixId?: string;
}

export interface TargetDiagnostics {
  boardCacheHits: number;
  boardCacheMisses: number;
  preparedRoleCacheHits: number;
  preparedRoleCacheMisses: number;
  candidateSets: Record<Role, number>;
  candidatesBeforePruning: Record<Role, number>;
  candidatesAfterPruning: Record<Role, number>;
  prefixesConsidered: number;
  prefixBoundPruned: number;
  coreBranchesConsidered: number;
  coreBranchesPruned: number;
  pairBranchesConsidered: number;
  pairBranchesPruned: number;
  triplesConsidered: number;
  triplesCompleted: number;
  triplesEarlyTerminated: number;
  scenarioChecks: number;
  prefixScenarioChecks: number;
  seedScenarioChecks: number;
  coreScenarioChecks: number;
  pairScenarioChecks: number;
  tripleScenarioChecks: number;
  survivingPairSampleBuilds: number;
  candidatePreparationMs: number;
  combinatorialSearchMs: number;
}

interface AdapterDiagnostics {
  boardCacheHits: number;
  boardCacheMisses: number;
  preparedRoleCacheHits: number;
  preparedRoleCacheMisses: number;
}

function newAdapterDiagnostics(): AdapterDiagnostics {
  return {
    boardCacheHits: 0,
    boardCacheMisses: 0,
    preparedRoleCacheHits: 0,
    preparedRoleCacheMisses: 0,
  };
}

let diagnosticsEnabled = false;
let adapterDiagnostics = newAdapterDiagnostics();

/** Enable/disable target benchmark diagnostics. Disabled by default in production. */
export function setTargetDiagnosticsEnabled(enabled: boolean): void {
  diagnosticsEnabled = enabled;
  setTargetSearchDiagnosticsEnabled(enabled);
}

/** Clear accumulated diagnostic counters without touching optimization caches. */
export function resetTargetDiagnostics(): void {
  adapterDiagnostics = newAdapterDiagnostics();
  resetTargetSearchDiagnostics();
}

/** Return the legacy Dota-facing diagnostic shape used by the M2 benchmark. */
export function getTargetDiagnostics(): TargetDiagnostics {
  const search = getTargetSearchDiagnostics();
  return {
    ...adapterDiagnostics,
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
    candidatePreparationMs: search.candidatePreparationMs,
    combinatorialSearchMs: search.combinatorialSearchMs,
  };
}

const targetChoiceCache = new WeakMap<DataBundle, Map<string, TargetBoardChoice>>();
const preparedRoleCache = new WeakMap<
  DataBundle,
  Map<string, PreparedTargetSearchCandidate<PlayerScore>[]>
>();

function searchCandidate(candidate: TargetCandidate): TargetSearchCandidate<PlayerScore> {
  return {
    payload: candidate.row,
    expected: candidate.row.expected,
    samples: candidate.row.samples,
    scale: 1 + candidate.boostPct / 100,
  };
}

function rosterFromSelected(selected: [PlayerScore, PlayerScore, PlayerScore]): TargetRosterChoice['roster'] {
  return {
    core: [selected[0]],
    mid: [selected[1]],
    support: [selected[2]],
  };
}

/** Public Dota-facing helper retained for exact synthetic regression tests. */
export function chooseTargetRoster(
  candidates: Record<Role, TargetCandidate[]>,
  targetScore: number,
  iterations: number,
): TargetRosterChoice | undefined {
  const choice = chooseTargetSearch<PlayerScore>(
    [
      candidates.core.map(searchCandidate),
      candidates.mid.map(searchCandidate),
      candidates.support.map(searchCandidate),
    ],
    targetScore,
    iterations,
  );

  if (!choice) return undefined;
  return {
    probability: choice.probability,
    expected: choice.expected,
    roster: rosterFromSelected(choice.selected),
    samples: choice.samples,
  };
}

function preparedRoleCandidates(
  role: Role,
  board: BoardState,
  data: DataBundle,
  prefixId: string | undefined,
  iterations: number,
): PreparedTargetSearchCandidate<PlayerScore>[] {
  let cache = preparedRoleCache.get(data);
  if (!cache) {
    cache = new Map();
    preparedRoleCache.set(data, cache);
  }

  const banner = board[role];
  const key = JSON.stringify([
    bannerMechanicsKey(banner),
    prefixId ?? null,
    iterations,
  ]);

  const prior = cache.get(key);
  if (prior) {
    if (diagnosticsEnabled) adapterDiagnostics.preparedRoleCacheHits++;
    return prior;
  }

  if (diagnosticsEnabled) adapterDiagnostics.preparedRoleCacheMisses++;

  const ranked = rankTeamsForRole(role, board, data, iterations);
  const candidates = ranked.map((row) => searchCandidate({
    row,
    boostPct:
      prefixId === undefined
        ? 0
        : titlePrefixBoostPct(data.titles, role, row.team, prefixId),
  }));

  const prepared = prepareTargetCandidates(
    candidates,
    iterations,
    ROLE_INDEX[role],
  );

  cache.set(key, prepared);
  return prepared;
}

function optimizeTargetBoard(
  board: BoardState,
  data: DataBundle,
  targetScore: number,
  iterations: number,
): TargetBoardChoice | undefined {
  let cache = targetChoiceCache.get(data);
  if (!cache) {
    cache = new Map();
    targetChoiceCache.set(data, cache);
  }

  const key = JSON.stringify([
    boardMechanicsKey(board),
    targetScore,
    iterations,
  ]);

  const cached = cache.get(key);
  if (cached) {
    if (diagnosticsEnabled) adapterDiagnostics.boardCacheHits++;
    return cached;
  }
  if (diagnosticsEnabled) adapterDiagnostics.boardCacheMisses++;

  const prefixIds: Array<string | undefined> = data.titles.prefixes.length
    ? data.titles.prefixes.map((prefix) => prefix.id)
    : [undefined];

  let best: TargetBoardChoice | undefined;

  for (const prefixId of prefixIds) {
    const prepared: PreparedTargetSearchGroups<PlayerScore> = [
      preparedRoleCandidates('core', board, data, prefixId, iterations),
      preparedRoleCandidates('mid', board, data, prefixId, iterations),
      preparedRoleCandidates('support', board, data, prefixId, iterations),
    ];

    const choice = choosePreparedTargetSearch(
      prepared,
      targetScore,
      iterations,
      best?.hits ?? -1,
      best?.expected ?? -Infinity,
    );

    if (!choice) continue;
    best = {
      hits: choice.hits,
      probability: choice.probability,
      expected: choice.expected,
      roster: rosterFromSelected(choice.selected),
      samples: choice.samples,
      ...(prefixId !== undefined ? { prefixId } : {}),
    };
  }

  if (best) cache.set(key, best);
  return best;
}

/** Fast scalar target utility for optimizer search. */
export function evaluateBoardTargetProbabilityFast(
  board: BoardState,
  data: DataBundle,
  targetScore: number,
  iterations = data.simulation.optimizerIterations,
): number {
  return optimizeTargetBoard(board, data, targetScore, iterations)?.probability ?? 0;
}

/**
 * Full terminal evaluation for target-probability mode. Free roster and title
 * prefix are selected by target probability itself.
 */
export function evaluateBoardTarget(
  board: BoardState,
  username: string,
  data: DataBundle,
  targetScore: number,
  iterations = data.simulation.optimizerIterations,
): BoardEvaluation {
  const choice = optimizeTargetBoard(board, data, targetScore, iterations);
  if (!choice) {
    throw new Error(
      'No complete legal Core/Mid/Support roster is available for target-probability evaluation.',
    );
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
