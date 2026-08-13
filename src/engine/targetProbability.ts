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

interface InternalTargetChoice extends TargetRosterChoice {
  hits: number;
}

interface TargetBoardChoice extends InternalTargetChoice {
  prefixId?: string;
}

const targetChoiceCache =
  new WeakMap<DataBundle, Map<string, TargetBoardChoice>>();

const preparedRoleCache =
  new WeakMap<DataBundle, Map<string, PreparedCandidate[]>>();

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

function adjustedExpected(candidate: TargetCandidate): number {
  return candidate.row.expected * (1 + candidate.boostPct / 100);
}

function prepareCandidate(
  candidate: TargetCandidate,
  iterations: number,
): PreparedCandidate {
  const factor = 1 + candidate.boostPct / 100;
  const samples = new Float64Array(iterations);

  for (let i = 0; i < iterations; i++) {
    samples[i] =
      (candidate.row.samples[i] ?? candidate.row.expected) * factor;
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
 *
 * Such a B can never be part of an optimal target-probability roster.
 */
function dominates(
  a: PreparedCandidate,
  b: PreparedCandidate,
): boolean {
  if (a.expected + EPSILON < b.expected) return false;

  let strictlyBetter = a.expected > b.expected + EPSILON;

  for (let i = 0; i < a.samples.length; i++) {
    if (a.samples[i]! + EPSILON < b.samples[i]!) return false;

    if (a.samples[i]! > b.samples[i]! + EPSILON) {
      strictlyBetter = true;
    }
  }

  return strictlyBetter;
}

function pruneDominated(
  candidates: PreparedCandidate[],
): PreparedCandidate[] {
  if (candidates.length < 2) return candidates;

  const keep = new Array<boolean>(candidates.length).fill(true);

  for (let i = 0; i < candidates.length; i++) {
    if (!keep[i]) continue;

    for (let j = 0; j < candidates.length; j++) {
      if (i === j || !keep[i]) continue;

      if (dominates(candidates[j]!, candidates[i]!)) {
        keep[i] = false;
      }
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
  return pruneDominated(
    candidates.map((candidate) =>
      prepareCandidate(candidate, iterations),
    ),
  );
}

function pointwiseMaximum(
  candidates: PreparedCandidate[],
  iterations: number,
): Float64Array {
  const out = new Float64Array(iterations);
  out.fill(-Infinity);

  for (const candidate of candidates) {
    for (let i = 0; i < iterations; i++) {
      if (candidate.samples[i]! > out[i]!) {
        out[i] = candidate.samples[i]!;
      }
    }
  }

  return out;
}

function maximumExpected(candidates: PreparedCandidate[]): number {
  let best = -Infinity;

  for (const candidate of candidates) {
    if (candidate.expected > best) best = candidate.expected;
  }

  return best;
}

function betterThan(
  hits: number,
  expected: number,
  bestHits: number,
  bestExpected: number,
): boolean {
  return (
    hits > bestHits
    || (
      hits === bestHits
      && expected > bestExpected + EPSILON
    )
  );
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

function countMaximumHits(
  a: Float64Array,
  b: Float64Array,
  c: Float64Array,
  targetScore: number,
): number {
  let hits = 0;

  for (let i = 0; i < a.length; i++) {
    if (a[i]! + b[i]! + c[i]! >= targetScore) {
      hits++;
    }
  }

  return hits;
}

/**
 * Exact search over the supplied sampled distributions.
 *
 * The pruning bounds are optimistic componentwise maxima, so they can only
 * remove branches that provably cannot improve either:
 *
 *   1. target-hit count, or
 *   2. expected-score tie-break.
 *
 * Therefore this returns the same optimum as exhaustive enumeration.
 */
function choosePreparedTargetRoster(
  candidates: Record<Role, PreparedCandidate[]>,
  targetScore: number,
  iterations: number,
  incumbentHits = -1,
  incumbentExpected = -Infinity,
): InternalTargetChoice | undefined {
  const n = Math.max(1, iterations);

  const cores = candidates.core;
  const mids = candidates.mid;
  const supports = candidates.support;

  if (!cores.length || !mids.length || !supports.length) {
    return undefined;
  }

  const maxCoreSamples = pointwiseMaximum(cores, n);
  const maxMidSamples = pointwiseMaximum(mids, n);
  const maxSupportSamples = pointwiseMaximum(supports, n);

  const maxCoreExpected = maximumExpected(cores);
  const maxMidExpected = maximumExpected(mids);
  const maxSupportExpected = maximumExpected(supports);

  /*
   * Prefix-wide optimistic bound. Each scenario is allowed to choose a
   * different team here, which is impossible in the real problem and
   * therefore safely optimistic.
   */
  const prefixUpperHits = countMaximumHits(
    maxCoreSamples,
    maxMidSamples,
    maxSupportSamples,
    targetScore,
  );

  const prefixUpperExpected =
    maxCoreExpected + maxMidExpected + maxSupportExpected;

  if (
    !boundCanBeat(
      prefixUpperHits,
      prefixUpperExpected,
      incumbentHits,
      incumbentExpected,
    )
  ) {
    return undefined;
  }

  let bestHits = incumbentHits;
  let bestExpected = incumbentExpected;

  let best:
    | [PreparedCandidate, PreparedCandidate, PreparedCandidate]
    | undefined;

  /*
   * Seed the incumbent with the highest-expected candidate from each role.
   * This is cheap and makes subsequent branch bounds useful immediately.
   */
  {
    const core = cores[0]!;
    const mid = mids[0]!;
    const support = supports[0]!;

    let hits = 0;

    for (let i = 0; i < n; i++) {
      if (
        core.samples[i]!
        + mid.samples[i]!
        + support.samples[i]!
        >= targetScore
      ) {
        hits++;
      }
    }

    const expected =
      core.expected + mid.expected + support.expected;

    if (betterThan(hits, expected, bestHits, bestExpected)) {
      bestHits = hits;
      bestExpected = expected;
      best = [core, mid, support];
    }
  }

  for (const core of cores) {
    /*
     * Optimistic Core branch:
     * allow the best Mid and Support independently in every scenario.
     */
    let coreUpperHits = 0;

    for (let i = 0; i < n; i++) {
      if (
        core.samples[i]!
        + maxMidSamples[i]!
        + maxSupportSamples[i]!
        >= targetScore
      ) {
        coreUpperHits++;
      }
    }

    const coreUpperExpected =
      core.expected + maxMidExpected + maxSupportExpected;

    if (
      !boundCanBeat(
        coreUpperHits,
        coreUpperExpected,
        bestHits,
        bestExpected,
      )
    ) {
      continue;
    }

    for (const mid of mids) {
      /*
       * Optimistic Core+Mid branch:
       * allow the best Support independently in every scenario.
       */
      let pairUpperHits = 0;

      for (let i = 0; i < n; i++) {
        if (
          core.samples[i]!
          + mid.samples[i]!
          + maxSupportSamples[i]!
          >= targetScore
        ) {
          pairUpperHits++;
        }
      }

      const pairExpected = core.expected + mid.expected;
      const pairUpperExpected =
        pairExpected + maxSupportExpected;

      if (
        !boundCanBeat(
          pairUpperHits,
          pairUpperExpected,
          bestHits,
          bestExpected,
        )
      ) {
        continue;
      }

      for (const support of supports) {
        const expected = pairExpected + support.expected;
        let hits = 0;
        let abandoned = false;

        for (let i = 0; i < n; i++) {
          if (
            core.samples[i]!
            + mid.samples[i]!
            + support.samples[i]!
            >= targetScore
          ) {
            hits++;
          }

          /*
           * Even if every remaining scenario succeeds, this candidate cannot
           * beat the incumbent. Stop evaluating it.
           */
          const remaining = n - i - 1;
          const maximumPossibleHits = hits + remaining;

          if (maximumPossibleHits < bestHits) {
            abandoned = true;
            break;
          }

          if (
            maximumPossibleHits === bestHits
            && expected <= bestExpected + EPSILON
          ) {
            abandoned = true;
            break;
          }
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

  /*
   * If an external incumbent beat every candidate in this prefix, there is
   * intentionally no local result.
   */
  if (!best) return undefined;

  const samples = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    samples[i] =
      best[0].samples[i]!
      + best[1].samples[i]!
      + best[2].samples[i]!;
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

/**
 * Public helper retained for exact synthetic regression tests.
 */
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

  const choice = choosePreparedTargetRoster(
    prepared,
    targetScore,
    n,
  );

  if (!choice) return undefined;

  return {
    probability: choice.probability,
    expected: choice.expected,
    roster: choice.roster,
    samples: choice.samples,
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
  if (prior) return prior;

  const ranked = rankTeamsForRole(
    role,
    board,
    data,
    iterations,
  );

  const rawCandidates: TargetCandidate[] = ranked.map((row) => ({
    row,
    boostPct:
      prefixId === undefined
        ? 0
        : titlePrefixBoostPct(
            data.titles,
            role,
            row.team,
            prefixId,
          ),
  }));

  const prepared = prepareCandidates(
    rawCandidates,
    iterations,
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

  /*
   * selectedTeam is deliberately excluded. Free roster optimization depends
   * on banner mechanics, not the team currently highlighted in the UI.
   */
  const key = JSON.stringify({
    board: boardMechanics(board),
    targetScore,
    iterations,
  });

  const cached = cache.get(key);
  if (cached) return cached;

  const prefixIds: Array<string | undefined> =
    data.titles.prefixes.length
      ? data.titles.prefixes.map((prefix) => prefix.id)
      : [undefined];

  let best: TargetBoardChoice | undefined;

  for (const prefixId of prefixIds) {
    const prepared: Record<Role, PreparedCandidate[]> = {
      core: preparedRoleCandidates(
        'core',
        board,
        data,
        prefixId,
        iterations,
      ),
      mid: preparedRoleCandidates(
        'mid',
        board,
        data,
        prefixId,
        iterations,
      ),
      support: preparedRoleCandidates(
        'support',
        board,
        data,
        prefixId,
        iterations,
      ),
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
  return (
    optimizeTargetBoard(
      board,
      data,
      targetScore,
      iterations,
    )?.probability ?? 0
  );
}

/**
 * Full terminal evaluation for target-probability mode.
 * Free roster and title prefix are selected by target probability itself.
 */
export function evaluateBoardTarget(
  board: BoardState,
  username: string,
  data: DataBundle,
  targetScore: number,
  iterations = data.simulation.optimizerIterations,
): BoardEvaluation {
  const choice = optimizeTargetBoard(
    board,
    data,
    targetScore,
    iterations,
  );

  if (!choice) {
    throw new Error(
      'No complete legal Core/Mid/Support roster is available for target-probability evaluation.',
    );
  }

  const title = recommendTitle(
    username,
    choice.roster,
    data.titles,
    choice.prefixId,
  );

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