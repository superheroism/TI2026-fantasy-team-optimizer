const EPSILON = 1e-12;
const SUFFIX_BLOCK_SIZE = 4;
const PAIR_CACHE_BYTE_LIMIT = 256 * 1024 * 1024;
const SUFFIX_CACHE_BYTE_LIMIT = 128 * 1024 * 1024;
function newDiagnostics() {
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
        suffixScenarioChecks: 0,
        survivingPairSampleBuilds: 0,
        thirdCandidatesVisited: 0,
        maxThirdCandidatesVisited: 0,
        suffixBoundCalls: 0,
        suffixBoundPruned: 0,
        suffixThirdCandidatesSkipped: 0,
        pairGroupCacheHits: 0,
        pairGroupCacheMisses: 0,
        pairSampleCacheHits: 0,
        pairSampleCacheMisses: 0,
        pairSampleCacheBuilds: 0,
        pairCacheResets: 0,
        pairCacheEstimatedBytes: 0,
        suffixCacheHits: 0,
        suffixCacheMisses: 0,
        suffixCacheBuilds: 0,
        suffixCacheResets: 0,
        suffixCacheEstimatedBytes: 0,
        candidatePreparationMs: 0,
        pairSampleBuildMs: 0,
        suffixSummaryBuildMs: 0,
        combinatorialSearchMs: 0,
    };
}
let diagnosticsEnabled = false;
let diagnostics = newDiagnostics();
let candidateCountSignatures = new Map();
let seenPreparedGroups = [
    new WeakSet(),
    new WeakSet(),
    new WeakSet(),
];
let seenPreparedTuples = new WeakMap();
let seenPreparedPairs = [
    new WeakMap(),
    new WeakMap(),
    new WeakMap(),
];
export function setTargetSearchDiagnosticsEnabled(enabled) {
    diagnosticsEnabled = enabled;
}
export function resetTargetSearchDiagnostics() {
    diagnostics = newDiagnostics();
    candidateCountSignatures = new Map();
    seenPreparedGroups = [new WeakSet(), new WeakSet(), new WeakSet()];
    seenPreparedTuples = new WeakMap();
    seenPreparedPairs = [new WeakMap(), new WeakMap(), new WeakMap()];
}
function signatureObject() {
    const out = {};
    for (const [key, count] of candidateCountSignatures) {
        const first = Math.floor(key / 1_000_000);
        const second = Math.floor((key % 1_000_000) / 1_000);
        const third = key % 1_000;
        out[`${first},${second},${third}`] = count;
    }
    return out;
}
export function getTargetSearchDiagnostics() {
    return {
        ...diagnostics,
        candidateSets: [...diagnostics.candidateSets],
        candidatesBeforePruning: [...diagnostics.candidatesBeforePruning],
        candidatesAfterPruning: [...diagnostics.candidatesAfterPruning],
        candidateCountSignatures: signatureObject(),
        uniquePreparedGroups: [...diagnostics.uniquePreparedGroups],
        uniquePreparedGroupPairs: [...diagnostics.uniquePreparedGroupPairs],
        pairCacheEstimatedBytes,
        suffixCacheEstimatedBytes,
    };
}
function nowMs() {
    return globalThis.performance?.now() ?? Date.now();
}
let preparedSummaryCache = new WeakMap();
let suffixBlockCache = new WeakMap();
let suffixCacheEstimatedBytes = 0;
let pairGroupCache = new WeakMap();
let pairCacheEstimatedBytes = 0;
const pairScratchPool = new Map();
export function clearTargetSearchOptimizationCaches() {
    preparedSummaryCache = new WeakMap();
    suffixBlockCache = new WeakMap();
    suffixCacheEstimatedBytes = 0;
    pairGroupCache = new WeakMap();
    pairCacheEstimatedBytes = 0;
    pairScratchPool.clear();
    if (diagnosticsEnabled) {
        diagnostics.pairCacheEstimatedBytes = 0;
        diagnostics.suffixCacheEstimatedBytes = 0;
    }
}
function acquirePairScratch(n) {
    const pool = pairScratchPool.get(n);
    return pool?.pop() ?? new Float64Array(n);
}
function releasePairScratch(samples) {
    let pool = pairScratchPool.get(samples.length);
    if (!pool) {
        pool = [];
        pairScratchPool.set(samples.length, pool);
    }
    if (pool.length < 4)
        pool.push(samples);
}
function prepareCandidate(candidate, iterations) {
    const scale = candidate.scale ?? 1;
    const samples = new Float64Array(iterations);
    for (let i = 0; i < iterations; i++) {
        samples[i] = (candidate.samples[i] ?? candidate.expected) * scale;
    }
    return {
        payload: candidate.payload,
        expected: candidate.expected * scale,
        samples,
    };
}
function dominates(a, b) {
    if (a.expected + EPSILON < b.expected)
        return false;
    let strictlyBetter = a.expected > b.expected + EPSILON;
    for (let i = 0; i < a.samples.length; i++) {
        if (a.samples[i] + EPSILON < b.samples[i])
            return false;
        if (a.samples[i] > b.samples[i] + EPSILON)
            strictlyBetter = true;
    }
    return strictlyBetter;
}
function pruneDominated(candidates) {
    if (candidates.length < 2)
        return candidates;
    const keep = new Array(candidates.length).fill(true);
    for (let i = 0; i < candidates.length; i++) {
        if (!keep[i])
            continue;
        for (let j = 0; j < candidates.length; j++) {
            if (i === j || !keep[i])
                continue;
            if (dominates(candidates[j], candidates[i]))
                keep[i] = false;
        }
    }
    return candidates
        .filter((_, i) => keep[i])
        .sort((a, b) => b.expected - a.expected);
}
export function prepareTargetCandidates(candidates, iterations, diagnosticGroup) {
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
function summarizePreparedCandidates(candidates, iterations) {
    const prior = preparedSummaryCache.get(candidates);
    if (prior)
        return prior;
    const maxSamples = new Float64Array(iterations);
    maxSamples.fill(-Infinity);
    let maxExpected = -Infinity;
    for (const candidate of candidates) {
        if (candidate.expected > maxExpected)
            maxExpected = candidate.expected;
        for (let i = 0; i < iterations; i++) {
            if (candidate.samples[i] > maxSamples[i]) {
                maxSamples[i] = candidate.samples[i];
            }
        }
    }
    const summary = { maxSamples, maxExpected };
    preparedSummaryCache.set(candidates, summary);
    return summary;
}
function suffixBoundStart(index) {
    return index === 1 || (index >= SUFFIX_BLOCK_SIZE && index % SUFFIX_BLOCK_SIZE === 0);
}
function summarizeSuffixBlocks(candidates, iterations) {
    const prior = suffixBlockCache.get(candidates);
    if (prior) {
        if (diagnosticsEnabled)
            diagnostics.suffixCacheHits++;
        return prior;
    }
    if (diagnosticsEnabled)
        diagnostics.suffixCacheMisses++;
    const boundCount = candidates.length <= 1
        ? 0
        : 1 + Math.max(0, Math.floor((candidates.length - 1) / SUFFIX_BLOCK_SIZE));
    const estimatedBytes = boundCount * iterations * Float64Array.BYTES_PER_ELEMENT
        + candidates.length * Float64Array.BYTES_PER_ELEMENT
        + candidates.length * 8;
    if (estimatedBytes === 0)
        return undefined;
    if (suffixCacheEstimatedBytes + estimatedBytes > SUFFIX_CACHE_BYTE_LIMIT) {
        suffixBlockCache = new WeakMap();
        suffixCacheEstimatedBytes = 0;
        if (diagnosticsEnabled)
            diagnostics.suffixCacheResets++;
    }
    const started = diagnosticsEnabled ? nowMs() : 0;
    const bounds = new Array(candidates.length);
    const maxExpected = new Float64Array(candidates.length);
    maxExpected.fill(-Infinity);
    const running = new Float64Array(iterations);
    running.fill(-Infinity);
    let runningExpected = -Infinity;
    for (let candidateIndex = candidates.length - 1; candidateIndex >= 0; candidateIndex--) {
        const candidate = candidates[candidateIndex];
        if (candidate.expected > runningExpected)
            runningExpected = candidate.expected;
        for (let i = 0; i < iterations; i++) {
            if (candidate.samples[i] > running[i])
                running[i] = candidate.samples[i];
        }
        if (suffixBoundStart(candidateIndex)) {
            bounds[candidateIndex] = new Float64Array(running);
            maxExpected[candidateIndex] = runningExpected;
        }
    }
    const summary = { bounds, maxExpected, estimatedBytes };
    suffixBlockCache.set(candidates, summary);
    suffixCacheEstimatedBytes += estimatedBytes;
    if (diagnosticsEnabled) {
        diagnostics.suffixCacheBuilds++;
        diagnostics.suffixCacheEstimatedBytes = suffixCacheEstimatedBytes;
        diagnostics.suffixSummaryBuildMs += nowMs() - started;
    }
    return summary;
}
function betterThan(hits, expected, bestHits, bestExpected) {
    return hits > bestHits || (hits === bestHits && expected > bestExpected + EPSILON);
}
function boundCanBeat(upperHits, upperExpected, bestHits, bestExpected) {
    if (upperHits > bestHits)
        return true;
    if (upperHits < bestHits)
        return false;
    return upperExpected > bestExpected + EPSILON;
}
function optimisticBoundCanBeat(a, b, c, targetScore, upperExpected, bestHits, bestExpected) {
    let hits = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
        if (a[i] + b[i] + c[i] >= targetScore)
            hits++;
        const checked = i + 1;
        const maximumPossibleHits = hits + n - checked;
        if (maximumPossibleHits < bestHits)
            return { canBeat: false, checked };
        if (maximumPossibleHits === bestHits && upperExpected <= bestExpected + EPSILON) {
            return { canBeat: false, checked };
        }
    }
    return { canBeat: boundCanBeat(hits, upperExpected, bestHits, bestExpected), checked: n };
}
function trackIdentity(groups) {
    const [first, second, third] = groups;
    const arrays = [first, second, third];
    for (let i = 0; i < 3; i++) {
        const group = arrays[i];
        if (!seenPreparedGroups[i].has(group)) {
            seenPreparedGroups[i].add(group);
            diagnostics.uniquePreparedGroups[i] = diagnostics.uniquePreparedGroups[i] + 1;
        }
    }
    let secondMap = seenPreparedTuples.get(first);
    if (!secondMap) {
        secondMap = new WeakMap();
        seenPreparedTuples.set(first, secondMap);
    }
    let thirds = secondMap.get(second);
    if (!thirds) {
        thirds = new WeakSet();
        secondMap.set(second, thirds);
    }
    if (thirds.has(third))
        diagnostics.reusedPreparedGroupTuples++;
    else {
        thirds.add(third);
        diagnostics.uniquePreparedGroupTuples++;
    }
    const pairValues = [[first, second], [second, third], [first, third]];
    for (let pairIndex = 0; pairIndex < 3; pairIndex++) {
        const [left, right] = pairValues[pairIndex];
        const pairMap = seenPreparedPairs[pairIndex];
        let rights = pairMap.get(left);
        if (!rights) {
            rights = new WeakSet();
            pairMap.set(left, rights);
        }
        if (rights.has(right))
            diagnostics.reusedPreparedGroupPairs[pairIndex] = diagnostics.reusedPreparedGroupPairs[pairIndex] + 1;
        else {
            rights.add(right);
            diagnostics.uniquePreparedGroupPairs[pairIndex] = diagnostics.uniquePreparedGroupPairs[pairIndex] + 1;
        }
    }
}
function pairCacheFor(first, second) {
    let secondMap = pairGroupCache.get(first);
    if (!secondMap) {
        secondMap = new WeakMap();
        pairGroupCache.set(first, secondMap);
    }
    let cache = secondMap.get(second);
    if (!cache) {
        cache = { uses: 1, samples: undefined, secondLength: second.length, disabled: false };
        secondMap.set(second, cache);
        if (diagnosticsEnabled)
            diagnostics.pairGroupCacheMisses++;
        return cache;
    }
    cache.uses++;
    if (diagnosticsEnabled)
        diagnostics.pairGroupCacheHits++;
    if (cache.uses === 2 && cache.samples === undefined && !cache.disabled) {
        const pointerBytes = first.length * second.length * 8;
        if (pairCacheEstimatedBytes + pointerBytes <= PAIR_CACHE_BYTE_LIMIT) {
            cache.samples = new Array(first.length * second.length);
            pairCacheEstimatedBytes += pointerBytes;
            if (diagnosticsEnabled)
                diagnostics.pairCacheEstimatedBytes = pairCacheEstimatedBytes;
        }
        else {
            pairGroupCache = new WeakMap();
            pairCacheEstimatedBytes = 0;
            cache.disabled = true;
            if (diagnosticsEnabled) {
                diagnostics.pairCacheResets++;
                diagnostics.pairCacheEstimatedBytes = 0;
            }
        }
    }
    return cache;
}
function storePairSamples(cache, index, samples) {
    if (!cache.samples)
        return samples;
    const bytes = samples.byteLength;
    if (pairCacheEstimatedBytes + bytes > PAIR_CACHE_BYTE_LIMIT) {
        pairGroupCache = new WeakMap();
        pairCacheEstimatedBytes = 0;
        cache.samples = undefined;
        cache.disabled = true;
        if (diagnosticsEnabled) {
            diagnostics.pairCacheResets++;
            diagnostics.pairCacheEstimatedBytes = 0;
        }
        return samples;
    }
    const retained = new Float64Array(samples);
    cache.samples[index] = retained;
    pairCacheEstimatedBytes += bytes;
    if (diagnosticsEnabled) {
        diagnostics.pairSampleCacheBuilds++;
        diagnostics.pairCacheEstimatedBytes = pairCacheEstimatedBytes;
    }
    return retained;
}
function materializeChoice(bestHits, bestExpected, best, n) {
    if (!best)
        return undefined;
    const samples = new Array(n);
    for (let i = 0; i < n; i++) {
        samples[i] = best[0].samples[i] + best[1].samples[i] + best[2].samples[i];
    }
    return {
        hits: bestHits,
        probability: bestHits / n,
        expected: bestExpected,
        selected: [best[0].payload, best[1].payload, best[2].payload],
        samples,
    };
}
/** Frozen pre-M5F implementation retained for deterministic reference equivalence tests. */
export function choosePreparedTargetSearchReference(groups, targetScore, iterations, incumbentHits = -1, incumbentExpected = -Infinity) {
    const n = Math.max(1, iterations);
    const first = groups[0], second = groups[1], third = groups[2];
    if (!first.length || !second.length || !third.length)
        return undefined;
    const firstSummary = summarizePreparedCandidates(first, n);
    const secondSummary = summarizePreparedCandidates(second, n);
    const thirdSummary = summarizePreparedCandidates(third, n);
    const searchUpperExpected = firstSummary.maxExpected + secondSummary.maxExpected + thirdSummary.maxExpected;
    if (!optimisticBoundCanBeat(firstSummary.maxSamples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, searchUpperExpected, incumbentHits, incumbentExpected).canBeat)
        return undefined;
    let bestHits = incumbentHits, bestExpected = incumbentExpected;
    let best;
    const seedA = first[0], seedB = second[0], seedC = third[0];
    let seedHits = 0;
    for (let i = 0; i < n; i++)
        if (seedA.samples[i] + seedB.samples[i] + seedC.samples[i] >= targetScore)
            seedHits++;
    const seedExpected = seedA.expected + seedB.expected + seedC.expected;
    if (betterThan(seedHits, seedExpected, bestHits, bestExpected)) {
        bestHits = seedHits;
        bestExpected = seedExpected;
        best = [seedA, seedB, seedC];
    }
    const pairSamples = new Float64Array(n);
    for (const a of first) {
        const firstUpperExpected = a.expected + secondSummary.maxExpected + thirdSummary.maxExpected;
        if (!optimisticBoundCanBeat(a.samples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, firstUpperExpected, bestHits, bestExpected).canBeat)
            continue;
        for (const b of second) {
            const pairExpected = a.expected + b.expected;
            const pairUpperExpected = pairExpected + thirdSummary.maxExpected;
            if (!optimisticBoundCanBeat(a.samples, b.samples, thirdSummary.maxSamples, targetScore, pairUpperExpected, bestHits, bestExpected).canBeat)
                continue;
            for (let i = 0; i < n; i++)
                pairSamples[i] = a.samples[i] + b.samples[i];
            for (const c of third) {
                const expected = pairExpected + c.expected;
                let hits = 0, abandoned = false;
                for (let i = 0; i < n; i++) {
                    if (pairSamples[i] + c.samples[i] >= targetScore)
                        hits++;
                    const maximumPossibleHits = hits + n - i - 1;
                    if (maximumPossibleHits < bestHits || (maximumPossibleHits === bestHits && expected <= bestExpected + EPSILON)) {
                        abandoned = true;
                        break;
                    }
                }
                if (abandoned)
                    continue;
                if (betterThan(hits, expected, bestHits, bestExpected)) {
                    bestHits = hits;
                    bestExpected = expected;
                    best = [a, b, c];
                }
            }
        }
    }
    return materializeChoice(bestHits, bestExpected, best, n);
}
export function choosePreparedTargetSearch(groups, targetScore, iterations, incumbentHits = -1, incumbentExpected = -Infinity) {
    const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
    const collect = diagnosticsEnabled;
    const n = Math.max(1, iterations);
    const first = groups[0], second = groups[1], third = groups[2];
    let searchChecks = 0, seedChecks = 0, firstChecks = 0, pairChecks = 0, tripleChecks = 0, suffixChecks = 0;
    let firstConsidered = 0, firstPruned = 0, pairConsidered = 0, pairPruned = 0;
    let triplesConsidered = 0, triplesCompleted = 0, triplesEarly = 0, pairBuilds = 0;
    let suffixCalls = 0, suffixPruned = 0, suffixSkipped = 0, thirdVisited = 0, maxThirdVisited = 0;
    let pairSampleHits = 0, pairSampleMisses = 0;
    let pairBuildMs = 0;
    if (collect) {
        diagnostics.searchesConsidered++;
        const signatureKey = first.length * 1_000_000 + second.length * 1_000 + third.length;
        candidateCountSignatures.set(signatureKey, (candidateCountSignatures.get(signatureKey) ?? 0) + 1);
        trackIdentity(groups);
    }
    if (!first.length || !second.length || !third.length) {
        if (collect)
            diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
        return undefined;
    }
    const firstSummary = summarizePreparedCandidates(first, n);
    const secondSummary = summarizePreparedCandidates(second, n);
    const thirdSummary = summarizePreparedCandidates(third, n);
    const suffixSummary = summarizeSuffixBlocks(third, n);
    const searchUpperExpected = firstSummary.maxExpected + secondSummary.maxExpected + thirdSummary.maxExpected;
    const searchBound = optimisticBoundCanBeat(firstSummary.maxSamples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, searchUpperExpected, incumbentHits, incumbentExpected);
    searchChecks += searchBound.checked;
    if (!searchBound.canBeat) {
        if (collect) {
            diagnostics.searchBoundPruned++;
            diagnostics.searchScenarioChecks += searchChecks;
            diagnostics.scenarioChecks += searchChecks;
            diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
        }
        return undefined;
    }
    let bestHits = incumbentHits, bestExpected = incumbentExpected;
    let best;
    const seedA = first[0], seedB = second[0], seedC = third[0];
    let seedHits = 0;
    for (let i = 0; i < n; i++)
        if (seedA.samples[i] + seedB.samples[i] + seedC.samples[i] >= targetScore)
            seedHits++;
    seedChecks += n;
    const seedExpected = seedA.expected + seedB.expected + seedC.expected;
    if (betterThan(seedHits, seedExpected, bestHits, bestExpected)) {
        bestHits = seedHits;
        bestExpected = seedExpected;
        best = [seedA, seedB, seedC];
    }
    const scratch = acquirePairScratch(n);
    const pairCache = pairCacheFor(first, second);
    try {
        firstConsidered = first.length;
        for (let ai = 0; ai < first.length; ai++) {
            const a = first[ai];
            const firstUpperExpected = a.expected + secondSummary.maxExpected + thirdSummary.maxExpected;
            const firstBound = optimisticBoundCanBeat(a.samples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, firstUpperExpected, bestHits, bestExpected);
            firstChecks += firstBound.checked;
            if (!firstBound.canBeat) {
                firstPruned++;
                continue;
            }
            pairConsidered += second.length;
            for (let bi = 0; bi < second.length; bi++) {
                const b = second[bi];
                const pairExpected = a.expected + b.expected;
                const pairUpperExpected = pairExpected + thirdSummary.maxExpected;
                const cacheIndex = ai * pairCache.secondLength + bi;
                let pairSamples = pairCache.samples?.[cacheIndex];
                let pairCanBeat = true;
                if (pairSamples) {
                    pairSampleHits++;
                    let hits = 0, checked = 0;
                    const thirdMax = thirdSummary.maxSamples;
                    for (let i = 0; i < n; i++) {
                        checked++;
                        if (pairSamples[i] + thirdMax[i] >= targetScore)
                            hits++;
                        const maximumPossibleHits = hits + n - checked;
                        if (maximumPossibleHits < bestHits || (maximumPossibleHits === bestHits && pairUpperExpected <= bestExpected + EPSILON)) {
                            pairCanBeat = false;
                            break;
                        }
                    }
                    pairChecks += checked;
                    if (pairCanBeat)
                        pairCanBeat = boundCanBeat(hits, pairUpperExpected, bestHits, bestExpected);
                }
                else {
                    pairSampleMisses++;
                    let hits = 0, checked = 0;
                    const as = a.samples, bs = b.samples, thirdMax = thirdSummary.maxSamples;
                    for (let i = 0; i < n; i++) {
                        checked++;
                        if (as[i] + bs[i] + thirdMax[i] >= targetScore)
                            hits++;
                        const maximumPossibleHits = hits + n - checked;
                        if (maximumPossibleHits < bestHits || (maximumPossibleHits === bestHits && pairUpperExpected <= bestExpected + EPSILON)) {
                            pairCanBeat = false;
                            break;
                        }
                    }
                    pairChecks += checked;
                    if (pairCanBeat)
                        pairCanBeat = boundCanBeat(hits, pairUpperExpected, bestHits, bestExpected);
                }
                if (!pairCanBeat) {
                    pairPruned++;
                    continue;
                }
                if (!pairSamples) {
                    const buildStart = collect ? nowMs() : 0;
                    const as = a.samples, bs = b.samples;
                    for (let i = 0; i < n; i++)
                        scratch[i] = as[i] + bs[i];
                    pairBuilds++;
                    if (collect)
                        pairBuildMs += nowMs() - buildStart;
                    if (pairCache.samples)
                        pairSamples = storePairSamples(pairCache, cacheIndex, scratch);
                    else
                        pairSamples = scratch;
                }
                let visitedThisPair = 0;
                for (let ci = 0; ci < third.length; ci++) {
                    const c = third[ci];
                    triplesConsidered++;
                    visitedThisPair++;
                    const expected = pairExpected + c.expected;
                    let hits = 0, checked = 0, abandoned = false;
                    const cs = c.samples;
                    for (let i = 0; i < n; i++) {
                        checked++;
                        if (pairSamples[i] + cs[i] >= targetScore)
                            hits++;
                        const maximumPossibleHits = hits + n - checked;
                        if (maximumPossibleHits < bestHits || (maximumPossibleHits === bestHits && expected <= bestExpected + EPSILON)) {
                            abandoned = true;
                            break;
                        }
                    }
                    tripleChecks += checked;
                    if (abandoned)
                        triplesEarly++;
                    else {
                        triplesCompleted++;
                        if (betterThan(hits, expected, bestHits, bestExpected)) {
                            bestHits = hits;
                            bestExpected = expected;
                            best = [a, b, c];
                        }
                    }
                    const next = ci + 1;
                    if (next >= third.length || !suffixSummary || !suffixBoundStart(next))
                        continue;
                    const suffixMax = suffixSummary.bounds[next];
                    if (!suffixMax)
                        continue;
                    suffixCalls++;
                    const suffixUpperExpected = pairExpected + suffixSummary.maxExpected[next];
                    let upperHits = 0, boundChecked = 0, canBeat = true;
                    for (let i = 0; i < n; i++) {
                        boundChecked++;
                        if (pairSamples[i] + suffixMax[i] >= targetScore)
                            upperHits++;
                        const maximumPossibleHits = upperHits + n - boundChecked;
                        if (maximumPossibleHits < bestHits || (maximumPossibleHits === bestHits && suffixUpperExpected <= bestExpected + EPSILON)) {
                            canBeat = false;
                            break;
                        }
                    }
                    suffixChecks += boundChecked;
                    if (canBeat)
                        canBeat = boundCanBeat(upperHits, suffixUpperExpected, bestHits, bestExpected);
                    if (!canBeat) {
                        suffixPruned++;
                        const skipped = third.length - next;
                        suffixSkipped += skipped;
                        break;
                    }
                }
                thirdVisited += visitedThisPair;
                if (visitedThisPair > maxThirdVisited)
                    maxThirdVisited = visitedThisPair;
            }
        }
    }
    finally {
        releasePairScratch(scratch);
    }
    if (collect) {
        diagnostics.firstBranchesConsidered += firstConsidered;
        diagnostics.firstBranchesPruned += firstPruned;
        diagnostics.pairBranchesConsidered += pairConsidered;
        diagnostics.pairBranchesPruned += pairPruned;
        diagnostics.triplesConsidered += triplesConsidered;
        diagnostics.triplesCompleted += triplesCompleted;
        diagnostics.triplesEarlyTerminated += triplesEarly;
        diagnostics.survivingPairSampleBuilds += pairBuilds;
        diagnostics.thirdCandidatesVisited += thirdVisited;
        if (maxThirdVisited > diagnostics.maxThirdCandidatesVisited)
            diagnostics.maxThirdCandidatesVisited = maxThirdVisited;
        diagnostics.suffixBoundCalls += suffixCalls;
        diagnostics.suffixBoundPruned += suffixPruned;
        diagnostics.suffixThirdCandidatesSkipped += suffixSkipped;
        diagnostics.pairSampleCacheHits += pairSampleHits;
        diagnostics.pairSampleCacheMisses += pairSampleMisses;
        diagnostics.searchScenarioChecks += searchChecks;
        diagnostics.seedScenarioChecks += seedChecks;
        diagnostics.firstScenarioChecks += firstChecks;
        diagnostics.pairScenarioChecks += pairChecks;
        diagnostics.tripleScenarioChecks += tripleChecks;
        diagnostics.suffixScenarioChecks += suffixChecks;
        diagnostics.scenarioChecks += searchChecks + seedChecks + firstChecks + pairChecks + tripleChecks + suffixChecks;
        diagnostics.pairSampleBuildMs += pairBuildMs;
        diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
    }
    return materializeChoice(bestHits, bestExpected, best, n);
}
export function chooseTargetSearch(groups, targetScore, iterations) {
    const n = Math.max(1, iterations);
    const prepared = [
        prepareTargetCandidates(groups[0], n, 0),
        prepareTargetCandidates(groups[1], n, 1),
        prepareTargetCandidates(groups[2], n, 2),
    ];
    return choosePreparedTargetSearch(prepared, targetScore, n);
}
//# sourceMappingURL=targetSearch.js.map