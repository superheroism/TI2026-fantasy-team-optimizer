import type {
  BannerState,
  BoardEvaluation,
  BoardState,
  DataBundle,
  PlayerScore,
  Role,
} from '../domain/types.js';

import { mean, percentile } from './distributions.js';
import { rankTeamsForRole } from './scoring.js';
import { recommendTitle, titlePrefixBoostPct } from './title.js';

const ROLES: Role[] = ['core', 'mid', 'support'];
const EPSILON = 1e-12;

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

interface PreparedCandidate {
  source: TargetCandidate;
  expected: number;
  samples: Float64Array;
}

interface PreparedCandidateSummary {
  maxSamples: Float64Array;
  maxExpected: number;
}

interface InternalTargetChoice extends TargetRosterChoice {
  hits: number;
}

interface TargetBoardChoice extends InternalTargetChoice {
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

function zeroRoleCounts(): Record<Role, number> {
  return { core: 0, mid: 0, support: 0 };
}

function newDiagnostics(): TargetDiagnostics {
  return {
    boardCacheHits: 0,
    boardCacheMisses: 0,
    preparedRoleCacheHits: 0,
    preparedRoleCacheMisses: 0,
    candidateSets: zeroRoleCounts(),
    candidatesBeforePruning: zeroRoleCounts(),
    candidatesAfterPruning: zeroRoleCounts(),
    prefixesConsidered: 0,
    prefixBoundPruned: 0,
    coreBranchesConsidered: 0,
    coreBranchesPruned: 0,
    pairBranchesConsidered: 0,
    pairBranchesPruned: 0,
    triplesConsidered: 0,
    triplesCompleted: 0,
    triplesEarlyTerminated: 0,
    scenarioChecks: 0,
    prefixScenarioChecks: 0,
    seedScenarioChecks: 0,
    coreScenarioChecks: 0,
    pairScenarioChecks: 0,
    tripleScenarioChecks: 0,
    survivingPairSampleBuilds: 0,
    candidatePreparationMs: 0,
    combinatorialSearchMs: 0,
  };
}

let diagnosticsEnabled = false;
let diagnostics = newDiagnostics();

/** Enable/disable benchmark diagnostics. Disabled by default in production. */
export function setTargetDiagnosticsEnabled(enabled: boolean): void {
  diagnosticsEnabled = enabled;
}

/** Clear accumulated diagnostic counters without touching optimization caches. */
export function resetTargetDiagnostics(): void {
  diagnostics = newDiagnostics();
}

/** Return a defensive snapshot suitable for benchmark reporting. */
export function getTargetDiagnostics(): TargetDiagnostics {
  return {
    ...diagnostics,
    candidateSets: { ...diagnostics.candidateSets },
    candidatesBeforePruning: { ...diagnostics.candidatesBeforePruning },
    candidatesAfterPruning: { ...diagnostics.candidatesAfterPruning },
  };
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

const targetChoiceCache = new WeakMap<DataBundle, Map<string, TargetBoardChoice>>();
const preparedRoleCache = new WeakMap<DataBundle, Map<string, PreparedCandidate[]>>();
const preparedSummaryCache = new WeakMap<PreparedCandidate[], PreparedCandidateSummary>();

function prepareCandidate(
  candidate: TargetCandidate,
  iterations: number,
): PreparedCandidate {
  const factor = 1 + candidate.boostPct / 100;
  const samples = new Float64Array(iterations);

  for (let i = 0; i < iterations; i++) {
    samples[i] = (candidate.row.samples[i] ?? candidate.row.expected) * factor;
  }

  return {
    source: candidate,
    expected: candidate.row.expected * factor,
    samples,
  };
}

/**
 * A dominates B when substituting A for B can never reduce total score in any
 * sampled scenario, and cannot worsen the expected-score tie-break.
 */
function dominates(a: PreparedCandidate, b: PreparedCandidate): boolean {
  if (a.expected + EPSILON < b.expected) return false;

  let strictlyBetter = a.expected > b.expected + EPSILON;

  for (let i = 0; i < a.samples.length; i++) {
    if (a.samples[i]! + EPSILON < b.samples[i]!) return false;
    if (a.samples[i]! > b.samples[i]! + EPSILON) strictlyBetter = true;
  }

  return strictlyBetter;
}

function pruneDominated(candidates: PreparedCandidate[]): PreparedCandidate[] {
  if (candidates.length < 2) return candidates;

  const keep = new Array<boolean>(candidates.length).fill(true);

  for (let i = 0; i < candidates.length; i++) {
    if (!keep[i]) continue;

    for (let j = 0; j < candidates.length; j++) {
      if (i === j || !keep[i]) continue;
      if (dominates(candidates[j]!, candidates[i]!)) keep[i] = false;
    }
  }

  return candidates
    .filter((_, i) => keep[i])
    .sort((a, b) => b.expected - a.expected);
}

function prepareCandidates(
  candidates: TargetCandidate[],
  iterations: number,
): PreparedCandidate[] {
  return pruneDominated(candidates.map((candidate) => prepareCandidate(candidate, iterations)));
}

function summarizePreparedCandidates(
  candidates: PreparedCandidate[],
  iterations: number,
): PreparedCandidateSummary {
  const prior = preparedSummaryCache.get(candidates);
  if (prior) return prior;

  const maxSamples = new Float64Array(iterations);
  maxSamples.fill(-Infinity);
  let maxExpected = -Infinity;

  for (const candidate of candidates) {
    if (candidate.expected > maxExpected) maxExpected = candidate.expected;
    for (let i = 0; i < iterations; i++) {
      if (candidate.samples[i]! > maxSamples[i]!) {
        maxSamples[i] = candidate.samples[i]!;
      }
    }
  }

  const summary = { maxSamples, maxExpected };
  preparedSummaryCache.set(candidates, summary);
  return summary;
}

function betterThan(
  hits: number,
  expected: number,
  bestHits: number,
  bestExpected: number,
): boolean {
  return hits > bestHits || (hits === bestHits && expected > bestExpected + EPSILON);
}

function boundCanBeat(
  upperHits: number,
  upperExpected: number,
  bestHits: number,
  bestExpected: number,
): boolean {
  if (upperHits > bestHits) return true;
  if (upperHits < bestHits) return false;
  return upperExpected > bestExpected + EPSILON;
}

type ScenarioCheckBucket = 'prefix' | 'seed' | 'core' | 'pair' | 'triple';

function recordScenarioChecks(bucket: ScenarioCheckBucket, count: number): void {
  if (!diagnosticsEnabled || count <= 0) return;
  diagnostics.scenarioChecks += count;
  if (bucket === 'prefix') diagnostics.prefixScenarioChecks += count;
  else if (bucket === 'seed') diagnostics.seedScenarioChecks += count;
  else if (bucket === 'core') diagnostics.coreScenarioChecks += count;
  else if (bucket === 'pair') diagnostics.pairScenarioChecks += count;
  else diagnostics.tripleScenarioChecks += count;
}

/**
 * Exact optimistic-bound test with early termination.
 *
 * The three arrays already describe an impossible optimistic branch (for example,
 * a fixed Core+Mid pair plus the pointwise-best Support). Once the number of hits
 * that could still be achieved is below the incumbent, the branch is provably dead
 * and the remaining scenarios do not need to be inspected.
 */
function optimisticBoundCanBeat(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  targetScore: number,
  upperExpected: number,
  bestHits: number,
  bestExpected: number,
  bucket: Exclude<ScenarioCheckBucket, 'seed' | 'triple'>,
): boolean {
  let hits = 0;
  let checked = 0;
  const n = a.length;

  for (let i = 0; i < n; i++) {
    checked++;
    if (a[i]! + b[i]! + c[i]! >= targetScore) hits++;

    const remaining = n - i - 1;
    const maximumPossibleHits = hits + remaining;

    if (maximumPossibleHits < bestHits) {
      if (diagnosticsEnabled) recordScenarioChecks(bucket, checked);
      return false;
    }

    if (
      maximumPossibleHits === bestHits
      && upperExpected <= bestExpected + EPSILON
    ) {
      if (diagnosticsEnabled) recordScenarioChecks(bucket, checked);
      return false;
    }
  }

  if (diagnosticsEnabled) recordScenarioChecks(bucket, checked);
  return boundCanBeat(hits, upperExpected, bestHits, bestExpected);
}

/**
 * Exact search over the supplied sampled distributions. Bounds are optimistic
 * componentwise maxima, so pruning cannot change the sampled optimum.
 */
function choosePreparedTargetRoster(
  candidates: Record<Role, PreparedCandidate[]>,
  targetScore: number,
  iterations: number,
  incumbentHits = -1,
  incumbentExpected = -Infinity,
): InternalTargetChoice | undefined {
  const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
  if (diagnosticsEnabled) diagnostics.prefixesConsidered++;

  const n = Math.max(1, iterations);
  const cores = candidates.core;
  const mids = candidates.mid;
  const supports = candidates.support;

  if (!cores.length || !mids.length || !supports.length) {
    if (diagnosticsEnabled) diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
    return undefined;
  }

  const coreSummary = summarizePreparedCandidates(cores, n);
  const midSummary = summarizePreparedCandidates(mids, n);
  const supportSummary = summarizePreparedCandidates(supports, n);

  const maxCoreSamples = coreSummary.maxSamples;
  const maxMidSamples = midSummary.maxSamples;
  const maxSupportSamples = supportSummary.maxSamples;

  const maxCoreExpected = coreSummary.maxExpected;
  const maxMidExpected = midSummary.maxExpected;
  const maxSupportExpected = supportSummary.maxExpected;

  const prefixUpperExpected = maxCoreExpected + maxMidExpected + maxSupportExpected;

  if (!optimisticBoundCanBeat(
    maxCoreSamples,
    maxMidSamples,
    maxSupportSamples,
    targetScore,
    prefixUpperExpected,
    incumbentHits,
    incumbentExpected,
    'prefix',
  )) {
    if (diagnosticsEnabled) {
      diagnostics.prefixBoundPruned++;
      diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
    }
    return undefined;
  }

  let bestHits = incumbentHits;
  let bestExpected = incumbentExpected;
  let best: [PreparedCandidate, PreparedCandidate, PreparedCandidate] | undefined;

  {
    const core = cores[0]!;
    const mid = mids[0]!;
    const support = supports[0]!;
    let hits = 0;

    for (let i = 0; i < n; i++) {
      if (core.samples[i]! + mid.samples[i]! + support.samples[i]! >= targetScore) hits++;
    }
    if (diagnosticsEnabled) recordScenarioChecks('seed', n);

    const expected = core.expected + mid.expected + support.expected;
    if (betterThan(hits, expected, bestHits, bestExpected)) {
      bestHits = hits;
      bestExpected = expected;
      best = [core, mid, support];
    }
  }

  const pairSamples = new Float64Array(n);

  for (const core of cores) {
    if (diagnosticsEnabled) diagnostics.coreBranchesConsidered++;
    const coreUpperExpected = core.expected + maxMidExpected + maxSupportExpected;
    if (!optimisticBoundCanBeat(
      core.samples,
      maxMidSamples,
      maxSupportSamples,
      targetScore,
      coreUpperExpected,
      bestHits,
      bestExpected,
      'core',
    )) {
      if (diagnosticsEnabled) diagnostics.coreBranchesPruned++;
      continue;
    }

    for (const mid of mids) {
      if (diagnosticsEnabled) diagnostics.pairBranchesConsidered++;
      const pairExpected = core.expected + mid.expected;
      const pairUpperExpected = pairExpected + maxSupportExpected;

      if (!optimisticBoundCanBeat(
        core.samples,
        mid.samples,
        maxSupportSamples,
        targetScore,
        pairUpperExpected,
        bestHits,
        bestExpected,
        'pair',
      )) {
        if (diagnosticsEnabled) diagnostics.pairBranchesPruned++;
        continue;
      }

      /*
       * Only surviving pairs pay to materialize Core+Mid once. The same 48 pair
       * sums are then reused for every Support candidate in this branch.
       */
      for (let i = 0; i < n; i++) {
        pairSamples[i] = core.samples[i]! + mid.samples[i]!;
      }
      if (diagnosticsEnabled) diagnostics.survivingPairSampleBuilds++;

      for (const support of supports) {
        if (diagnosticsEnabled) diagnostics.triplesConsidered++;
        const expected = pairExpected + support.expected;
        let hits = 0;
        let abandoned = false;
        let checked = 0;

        for (let i = 0; i < n; i++) {
          checked++;
          if (pairSamples[i]! + support.samples[i]! >= targetScore) hits++;

          const remaining = n - i - 1;
          const maximumPossibleHits = hits + remaining;

          if (maximumPossibleHits < bestHits) {
            abandoned = true;
            break;
          }

          if (maximumPossibleHits === bestHits && expected <= bestExpected + EPSILON) {
            abandoned = true;
            break;
          }
        }

        if (diagnosticsEnabled) recordScenarioChecks('triple', checked);
        if (diagnosticsEnabled) {
          if (abandoned) diagnostics.triplesEarlyTerminated++;
          else diagnostics.triplesCompleted++;
        }

        if (abandoned) continue;

        if (betterThan(hits, expected, bestHits, bestExpected)) {
          bestHits = hits;
          bestExpected = expected;
          best = [core, mid, support];
        }
      }
    }
  }

  if (diagnosticsEnabled) diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
  if (!best) return undefined;

  const samples = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    samples[i] = best[0].samples[i]! + best[1].samples[i]! + best[2].samples[i]!;
  }

  return {
    hits: bestHits,
    probability: bestHits / n,
    expected: bestExpected,
    roster: {
      core: [best[0].source.row],
      mid: [best[1].source.row],
      support: [best[2].source.row],
    },
    samples,
  };
}

/** Public helper retained for exact synthetic regression tests. */
export function chooseTargetRoster(
  candidates: Record<Role, TargetCandidate[]>,
  targetScore: number,
  iterations: number,
): TargetRosterChoice | undefined {
  const n = Math.max(1, iterations);
  const prepared: Record<Role, PreparedCandidate[]> = {
    core: prepareCandidates(candidates.core, n),
    mid: prepareCandidates(candidates.mid, n),
    support: prepareCandidates(candidates.support, n),
  };

  const choice = choosePreparedTargetRoster(prepared, targetScore, n);
  if (!choice) return undefined;

  return {
    probability: choice.probability,
    expected: choice.expected,
    roster: choice.roster,
    samples: choice.samples,
  };
}

function bannerMechanics(banner: BannerState) {
  return {
    role: banner.role,
    emblems: banner.emblems,
    expectedSeries: banner.expectedSeries,
  };
}

function boardMechanics(board: BoardState) {
  return {
    core: bannerMechanics(board.core),
    mid: bannerMechanics(board.mid),
    support: bannerMechanics(board.support),
  };
}

function preparedRoleCandidates(
  role: Role,
  board: BoardState,
  data: DataBundle,
  prefixId: string | undefined,
  iterations: number,
): PreparedCandidate[] {
  let cache = preparedRoleCache.get(data);
  if (!cache) {
    cache = new Map();
    preparedRoleCache.set(data, cache);
  }

  const banner = board[role];
  const key = JSON.stringify({
    role,
    banner: bannerMechanics(banner),
    prefixId: prefixId ?? null,
    iterations,
  });

  const prior = cache.get(key);
  if (prior) {
    if (diagnosticsEnabled) diagnostics.preparedRoleCacheHits++;
    return prior;
  }

  const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
  if (diagnosticsEnabled) diagnostics.preparedRoleCacheMisses++;

  const ranked = rankTeamsForRole(role, board, data, iterations);
  const rawCandidates: TargetCandidate[] = ranked.map((row) => ({
    row,
    boostPct:
      prefixId === undefined
        ? 0
        : titlePrefixBoostPct(data.titles, role, row.team, prefixId),
  }));

  const prepared = prepareCandidates(rawCandidates, iterations);

  if (diagnosticsEnabled) {
    diagnostics.candidateSets[role]++;
    diagnostics.candidatesBeforePruning[role] += rawCandidates.length;
    diagnostics.candidatesAfterPruning[role] += prepared.length;
    diagnostics.candidatePreparationMs += nowMs() - diagnosticStart;
  }

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

  const key = JSON.stringify({
    board: boardMechanics(board),
    targetScore,
    iterations,
  });

  const cached = cache.get(key);
  if (cached) {
    if (diagnosticsEnabled) diagnostics.boardCacheHits++;
    return cached;
  }
  if (diagnosticsEnabled) diagnostics.boardCacheMisses++;

  const prefixIds: Array<string | undefined> = data.titles.prefixes.length
    ? data.titles.prefixes.map((prefix) => prefix.id)
    : [undefined];

  let best: TargetBoardChoice | undefined;

  for (const prefixId of prefixIds) {
    const prepared: Record<Role, PreparedCandidate[]> = {
      core: preparedRoleCandidates('core', board, data, prefixId, iterations),
      mid: preparedRoleCandidates('mid', board, data, prefixId, iterations),
      support: preparedRoleCandidates('support', board, data, prefixId, iterations),
    };

    const choice = choosePreparedTargetRoster(
      prepared,
      targetScore,
      iterations,
      best?.hits ?? -1,
      best?.expected ?? -Infinity,
    );

    if (!choice) continue;
    best = {
      ...choice,
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
