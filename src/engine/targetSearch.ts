const EPSILON = 1e-12;

export type TargetSearchGroupIndex = 0 | 1 | 2;

export interface TargetSearchCandidate<T> {
  payload: T;
  expected: number;
  samples: readonly number[];
  scale?: number;
}

export interface PreparedTargetSearchCandidate<T> {
  payload: T;
  expected: number;
  samples: Float64Array;
}

export type PreparedTargetSearchGroups<T> = readonly [
  readonly PreparedTargetSearchCandidate<T>[],
  readonly PreparedTargetSearchCandidate<T>[],
  readonly PreparedTargetSearchCandidate<T>[],
];

export type TargetSearchGroups<T> = readonly [
  readonly TargetSearchCandidate<T>[],
  readonly TargetSearchCandidate<T>[],
  readonly TargetSearchCandidate<T>[],
];

export interface TargetSearchChoice<T> {
  hits: number;
  probability: number;
  expected: number;
  selected: [T, T, T];
  samples: number[];
}

export interface TargetSearchDiagnostics {
  candidateSets: [number, number, number];
  candidatesBeforePruning: [number, number, number];
  candidatesAfterPruning: [number, number, number];
  searchesConsidered: number;
  candidateCountSignatures: Record<string, number>;
  uniquePreparedGroups: [number, number, number];
  uniquePreparedGroupTuples: number;
  reusedPreparedGroupTuples: number;
  uniquePreparedGroupPairs: [number, number, number];
  reusedPreparedGroupPairs: [number, number, number];
  searchBoundPruned: number;
  firstBranchesConsidered: number;
  firstBranchesPruned: number;
  pairBranchesConsidered: number;
  pairBranchesPruned: number;
  triplesConsidered: number;
  triplesCompleted: number;
  triplesEarlyTerminated: number;
  scenarioChecks: number;
  searchScenarioChecks: number;
  seedScenarioChecks: number;
  firstScenarioChecks: number;
  pairScenarioChecks: number;
  tripleScenarioChecks: number;
  survivingPairSampleBuilds: number;
  thirdCandidatesVisited: number;
  maxThirdCandidatesVisited: number;
  candidatePreparationMs: number;
  combinatorialSearchMs: number;
}

interface PreparedCandidateSummary {
  maxSamples: Float64Array;
  maxExpected: number;
}

function newDiagnostics(): TargetSearchDiagnostics {
  return {
    candidateSets: [0, 0, 0],
    candidatesBeforePruning: [0, 0, 0],
    candidatesAfterPruning: [0, 0, 0],
    searchesConsidered: 0,
    candidateCountSignatures: {},
    uniquePreparedGroups: [0, 0, 0],
    uniquePreparedGroupTuples: 0,
    reusedPreparedGroupTuples: 0,
    uniquePreparedGroupPairs: [0, 0, 0],
    reusedPreparedGroupPairs: [0, 0, 0],
    searchBoundPruned: 0,
    firstBranchesConsidered: 0,
    firstBranchesPruned: 0,
    pairBranchesConsidered: 0,
    pairBranchesPruned: 0,
    triplesConsidered: 0,
    triplesCompleted: 0,
    triplesEarlyTerminated: 0,
    scenarioChecks: 0,
    searchScenarioChecks: 0,
    seedScenarioChecks: 0,
    firstScenarioChecks: 0,
    pairScenarioChecks: 0,
    tripleScenarioChecks: 0,
    survivingPairSampleBuilds: 0,
    thirdCandidatesVisited: 0,
    maxThirdCandidatesVisited: 0,
    candidatePreparationMs: 0,
    combinatorialSearchMs: 0,
  };
}

let diagnosticsEnabled = false;
let diagnostics = newDiagnostics();
let candidateCountSignatures = new Map<number, number>();
let seenPreparedGroups: [WeakSet<object>, WeakSet<object>, WeakSet<object>] = [new WeakSet(), new WeakSet(), new WeakSet()];
let seenPreparedTuples = new WeakMap<object, WeakMap<object, WeakSet<object>>>();
let seenPreparedPairs: [WeakMap<object, WeakSet<object>>, WeakMap<object, WeakSet<object>>, WeakMap<object, WeakSet<object>>] = [new WeakMap(), new WeakMap(), new WeakMap()];

export function setTargetSearchDiagnosticsEnabled(enabled: boolean): void {
  diagnosticsEnabled = enabled;
}

export function resetTargetSearchDiagnostics(): void {
  diagnostics = newDiagnostics();
  candidateCountSignatures = new Map();
  seenPreparedGroups = [new WeakSet(), new WeakSet(), new WeakSet()];
  seenPreparedTuples = new WeakMap();
  seenPreparedPairs = [new WeakMap(), new WeakMap(), new WeakMap()];
}

function signatureObject(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, count] of candidateCountSignatures) {
    const first = Math.floor(key / 1_000_000);
    const second = Math.floor((key % 1_000_000) / 1_000);
    const third = key % 1_000;
    out[`${first},${second},${third}`] = count;
  }
  return out;
}

export function getTargetSearchDiagnostics(): TargetSearchDiagnostics {
  return {
    ...diagnostics,
    candidateSets: [...diagnostics.candidateSets],
    candidatesBeforePruning: [...diagnostics.candidatesBeforePruning],
    candidatesAfterPruning: [...diagnostics.candidatesAfterPruning],
    candidateCountSignatures: signatureObject(),
    uniquePreparedGroups: [...diagnostics.uniquePreparedGroups],
    uniquePreparedGroupPairs: [...diagnostics.uniquePreparedGroupPairs],
  };
}

function nowMs(): number {
  return globalThis.performance?.now() ?? Date.now();
}

const preparedSummaryCache = new WeakMap<object, PreparedCandidateSummary>();

function prepareCandidate<T>(candidate: TargetSearchCandidate<T>, iterations: number): PreparedTargetSearchCandidate<T> {
  const scale = candidate.scale ?? 1;
  const samples = new Float64Array(iterations);
  for (let i = 0; i < iterations; i++) samples[i] = (candidate.samples[i] ?? candidate.expected) * scale;
  return { payload: candidate.payload, expected: candidate.expected * scale, samples };
}

function dominates<T>(a: PreparedTargetSearchCandidate<T>, b: PreparedTargetSearchCandidate<T>): boolean {
  if (a.expected + EPSILON < b.expected) return false;
  let strictlyBetter = a.expected > b.expected + EPSILON;
  for (let i = 0; i < a.samples.length; i++) {
    if (a.samples[i]! + EPSILON < b.samples[i]!) return false;
    if (a.samples[i]! > b.samples[i]! + EPSILON) strictlyBetter = true;
  }
  return strictlyBetter;
}

function pruneDominated<T>(candidates: PreparedTargetSearchCandidate<T>[]): PreparedTargetSearchCandidate<T>[] {
  if (candidates.length < 2) return candidates;
  const keep = new Array<boolean>(candidates.length).fill(true);
  for (let i = 0; i < candidates.length; i++) {
    if (!keep[i]) continue;
    for (let j = 0; j < candidates.length; j++) {
      if (i === j || !keep[i]) continue;
      if (dominates(candidates[j]!, candidates[i]!)) keep[i] = false;
    }
  }
  return candidates.filter((_, i) => keep[i]).sort((a, b) => b.expected - a.expected);
}

export function prepareTargetCandidates<T>(
  candidates: readonly TargetSearchCandidate<T>[],
  iterations: number,
  diagnosticGroup?: TargetSearchGroupIndex,
): PreparedTargetSearchCandidate<T>[] {
  const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
  const prepared = pruneDominated(candidates.map((candidate) => prepareCandidate(candidate, iterations)));
  if (diagnosticsEnabled) {
    if (diagnosticGroup !== undefined) {
      diagnostics.candidateSets[diagnosticGroup]++;
      diagnostics.candidatesBeforePruning[diagnosticGroup] += candidates.length;
      diagnostics.candidatesAfterPruning[diagnosticGroup] += prepared.length;
    }
    diagnostics.candidatePreparationMs += nowMs() - diagnosticStart;
  }
  return prepared;
}

function summarizePreparedCandidates<T>(candidates: readonly PreparedTargetSearchCandidate<T>[], iterations: number): PreparedCandidateSummary {
  const prior = preparedSummaryCache.get(candidates);
  if (prior) return prior;
  const maxSamples = new Float64Array(iterations);
  maxSamples.fill(-Infinity);
  let maxExpected = -Infinity;
  for (const candidate of candidates) {
    if (candidate.expected > maxExpected) maxExpected = candidate.expected;
    for (let i = 0; i < iterations; i++) if (candidate.samples[i]! > maxSamples[i]!) maxSamples[i] = candidate.samples[i]!;
  }
  const summary = { maxSamples, maxExpected };
  preparedSummaryCache.set(candidates, summary);
  return summary;
}

function betterThan(hits: number, expected: number, bestHits: number, bestExpected: number): boolean {
  return hits > bestHits || (hits === bestHits && expected > bestExpected + EPSILON);
}

function boundCanBeat(upperHits: number, upperExpected: number, bestHits: number, bestExpected: number): boolean {
  if (upperHits > bestHits) return true;
  if (upperHits < bestHits) return false;
  return upperExpected > bestExpected + EPSILON;
}

type ScenarioCheckBucket = 'search' | 'seed' | 'first' | 'pair' | 'triple';

function recordScenarioChecks(bucket: ScenarioCheckBucket, count: number): void {
  if (!diagnosticsEnabled || count <= 0) return;
  diagnostics.scenarioChecks += count;
  if (bucket === 'search') diagnostics.searchScenarioChecks += count;
  else if (bucket === 'seed') diagnostics.seedScenarioChecks += count;
  else if (bucket === 'first') diagnostics.firstScenarioChecks += count;
  else if (bucket === 'pair') diagnostics.pairScenarioChecks += count;
  else diagnostics.tripleScenarioChecks += count;
}

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
    if (maximumPossibleHits < bestHits) { recordScenarioChecks(bucket, checked); return false; }
    if (maximumPossibleHits === bestHits && upperExpected <= bestExpected + EPSILON) { recordScenarioChecks(bucket, checked); return false; }
  }
  recordScenarioChecks(bucket, checked);
  return boundCanBeat(hits, upperExpected, bestHits, bestExpected);
}

function trackSearchIdentity(groups: PreparedTargetSearchGroups<unknown>): void {
  const [first, second, third] = groups;
  const arrays = [first, second, third] as const;
  for (let i = 0; i < 3; i++) {
    const group = arrays[i]!;
    if (!seenPreparedGroups[i]!.has(group)) {
      seenPreparedGroups[i]!.add(group);
      diagnostics.uniquePreparedGroups[i] = diagnostics.uniquePreparedGroups[i]! + 1;
    }
  }
  let secondMap = seenPreparedTuples.get(first);
  if (!secondMap) { secondMap = new WeakMap(); seenPreparedTuples.set(first, secondMap); }
  let thirds = secondMap.get(second);
  if (!thirds) { thirds = new WeakSet(); secondMap.set(second, thirds); }
  if (thirds.has(third)) diagnostics.reusedPreparedGroupTuples++;
  else { thirds.add(third); diagnostics.uniquePreparedGroupTuples++; }

  const pairs: readonly [object, object][] = [[first, second], [second, third], [first, third]];
  for (let pairIndex = 0; pairIndex < 3; pairIndex++) {
    const [left, right] = pairs[pairIndex]!;
    const pairMap = seenPreparedPairs[pairIndex]!;
    let rights = pairMap.get(left);
    if (!rights) { rights = new WeakSet(); pairMap.set(left, rights); }
    if (rights.has(right)) diagnostics.reusedPreparedGroupPairs[pairIndex] = diagnostics.reusedPreparedGroupPairs[pairIndex]! + 1;
    else { rights.add(right); diagnostics.uniquePreparedGroupPairs[pairIndex] = diagnostics.uniquePreparedGroupPairs[pairIndex]! + 1; }
  }
}

export function choosePreparedTargetSearch<T>(
  groups: PreparedTargetSearchGroups<T>,
  targetScore: number,
  iterations: number,
  incumbentHits = -1,
  incumbentExpected = -Infinity,
): TargetSearchChoice<T> | undefined {
  const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
  if (diagnosticsEnabled) {
    diagnostics.searchesConsidered++;
    const signatureKey = groups[0].length * 1_000_000 + groups[1].length * 1_000 + groups[2].length;
    candidateCountSignatures.set(signatureKey, (candidateCountSignatures.get(signatureKey) ?? 0) + 1);
    trackSearchIdentity(groups as PreparedTargetSearchGroups<unknown>);
  }

  const n = Math.max(1, iterations);
  const first = groups[0];
  const second = groups[1];
  const third = groups[2];

  if (!first.length || !second.length || !third.length) {
    if (diagnosticsEnabled) diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
    return undefined;
  }

  const firstSummary = summarizePreparedCandidates(first, n);
  const secondSummary = summarizePreparedCandidates(second, n);
  const thirdSummary = summarizePreparedCandidates(third, n);
  const searchUpperExpected = firstSummary.maxExpected + secondSummary.maxExpected + thirdSummary.maxExpected;

  if (!optimisticBoundCanBeat(firstSummary.maxSamples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, searchUpperExpected, incumbentHits, incumbentExpected, 'search')) {
    if (diagnosticsEnabled) {
      diagnostics.searchBoundPruned++;
      diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
    }
    return undefined;
  }

  let bestHits = incumbentHits;
  let bestExpected = incumbentExpected;
  let best: [PreparedTargetSearchCandidate<T>, PreparedTargetSearchCandidate<T>, PreparedTargetSearchCandidate<T>] | undefined;

  {
    const a = first[0]!;
    const b = second[0]!;
    const c = third[0]!;
    let hits = 0;
    for (let i = 0; i < n; i++) if (a.samples[i]! + b.samples[i]! + c.samples[i]! >= targetScore) hits++;
    recordScenarioChecks('seed', n);
    const expected = a.expected + b.expected + c.expected;
    if (betterThan(hits, expected, bestHits, bestExpected)) {
      bestHits = hits;
      bestExpected = expected;
      best = [a, b, c];
    }
  }

  const pairSamples = new Float64Array(n);

  for (const a of first) {
    if (diagnosticsEnabled) diagnostics.firstBranchesConsidered++;
    const firstUpperExpected = a.expected + secondSummary.maxExpected + thirdSummary.maxExpected;
    if (!optimisticBoundCanBeat(a.samples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, firstUpperExpected, bestHits, bestExpected, 'first')) {
      if (diagnosticsEnabled) diagnostics.firstBranchesPruned++;
      continue;
    }

    for (const b of second) {
      if (diagnosticsEnabled) diagnostics.pairBranchesConsidered++;
      const pairExpected = a.expected + b.expected;
      const pairUpperExpected = pairExpected + thirdSummary.maxExpected;
      if (!optimisticBoundCanBeat(a.samples, b.samples, thirdSummary.maxSamples, targetScore, pairUpperExpected, bestHits, bestExpected, 'pair')) {
        if (diagnosticsEnabled) diagnostics.pairBranchesPruned++;
        continue;
      }

      for (let i = 0; i < n; i++) pairSamples[i] = a.samples[i]! + b.samples[i]!;
      if (diagnosticsEnabled) {
        diagnostics.survivingPairSampleBuilds++;
        diagnostics.thirdCandidatesVisited += third.length;
        if (third.length > diagnostics.maxThirdCandidatesVisited) diagnostics.maxThirdCandidatesVisited = third.length;
      }

      for (const c of third) {
        if (diagnosticsEnabled) diagnostics.triplesConsidered++;
        const expected = pairExpected + c.expected;
        let hits = 0;
        let abandoned = false;
        let checked = 0;
        for (let i = 0; i < n; i++) {
          checked++;
          if (pairSamples[i]! + c.samples[i]! >= targetScore) hits++;
          const remaining = n - i - 1;
          const maximumPossibleHits = hits + remaining;
          if (maximumPossibleHits < bestHits) { abandoned = true; break; }
          if (maximumPossibleHits === bestHits && expected <= bestExpected + EPSILON) { abandoned = true; break; }
        }
        recordScenarioChecks('triple', checked);
        if (diagnosticsEnabled) {
          if (abandoned) diagnostics.triplesEarlyTerminated++;
          else diagnostics.triplesCompleted++;
        }
        if (abandoned) continue;
        if (betterThan(hits, expected, bestHits, bestExpected)) {
          bestHits = hits;
          bestExpected = expected;
          best = [a, b, c];
        }
      }
    }
  }

  if (diagnosticsEnabled) diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
  if (!best) return undefined;
  const samples = new Array<number>(n);
  for (let i = 0; i < n; i++) samples[i] = best[0].samples[i]! + best[1].samples[i]! + best[2].samples[i]!;
  return { hits: bestHits, probability: bestHits / n, expected: bestExpected, selected: [best[0].payload, best[1].payload, best[2].payload], samples };
}

export function chooseTargetSearch<T>(
  groups: TargetSearchGroups<T>,
  targetScore: number,
  iterations: number,
): TargetSearchChoice<T> | undefined {
  const n = Math.max(1, iterations);
  const prepared: PreparedTargetSearchGroups<T> = [
    prepareTargetCandidates(groups[0], n, 0),
    prepareTargetCandidates(groups[1], n, 1),
    prepareTargetCandidates(groups[2], n, 2),
  ];
  return choosePreparedTargetSearch(prepared, targetScore, n);
}
