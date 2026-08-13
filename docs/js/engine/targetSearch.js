const EPSILON = 1e-12;
function newDiagnostics() {
    return {
        candidateSets: [0, 0, 0],
        candidatesBeforePruning: [0, 0, 0],
        candidatesAfterPruning: [0, 0, 0],
        searchesConsidered: 0,
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
        candidatePreparationMs: 0,
        combinatorialSearchMs: 0,
    };
}
let diagnosticsEnabled = false;
let diagnostics = newDiagnostics();
export function setTargetSearchDiagnosticsEnabled(enabled) {
    diagnosticsEnabled = enabled;
}
export function resetTargetSearchDiagnostics() {
    diagnostics = newDiagnostics();
}
export function getTargetSearchDiagnostics() {
    return {
        ...diagnostics,
        candidateSets: [...diagnostics.candidateSets],
        candidatesBeforePruning: [...diagnostics.candidatesBeforePruning],
        candidatesAfterPruning: [...diagnostics.candidatesAfterPruning],
    };
}
function nowMs() {
    return globalThis.performance?.now() ?? Date.now();
}
const preparedSummaryCache = new WeakMap();
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
function recordScenarioChecks(bucket, count) {
    if (!diagnosticsEnabled || count <= 0)
        return;
    diagnostics.scenarioChecks += count;
    if (bucket === 'search')
        diagnostics.searchScenarioChecks += count;
    else if (bucket === 'seed')
        diagnostics.seedScenarioChecks += count;
    else if (bucket === 'first')
        diagnostics.firstScenarioChecks += count;
    else if (bucket === 'pair')
        diagnostics.pairScenarioChecks += count;
    else
        diagnostics.tripleScenarioChecks += count;
}
function optimisticBoundCanBeat(a, b, c, targetScore, upperExpected, bestHits, bestExpected, bucket) {
    let hits = 0;
    let checked = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
        checked++;
        if (a[i] + b[i] + c[i] >= targetScore)
            hits++;
        const remaining = n - i - 1;
        const maximumPossibleHits = hits + remaining;
        if (maximumPossibleHits < bestHits) {
            recordScenarioChecks(bucket, checked);
            return false;
        }
        if (maximumPossibleHits === bestHits
            && upperExpected <= bestExpected + EPSILON) {
            recordScenarioChecks(bucket, checked);
            return false;
        }
    }
    recordScenarioChecks(bucket, checked);
    return boundCanBeat(hits, upperExpected, bestHits, bestExpected);
}
export function choosePreparedTargetSearch(groups, targetScore, iterations, incumbentHits = -1, incumbentExpected = -Infinity) {
    const diagnosticStart = diagnosticsEnabled ? nowMs() : 0;
    if (diagnosticsEnabled)
        diagnostics.searchesConsidered++;
    const n = Math.max(1, iterations);
    const first = groups[0];
    const second = groups[1];
    const third = groups[2];
    if (!first.length || !second.length || !third.length) {
        if (diagnosticsEnabled)
            diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
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
    let best;
    {
        const a = first[0];
        const b = second[0];
        const c = third[0];
        let hits = 0;
        for (let i = 0; i < n; i++) {
            if (a.samples[i] + b.samples[i] + c.samples[i] >= targetScore)
                hits++;
        }
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
        if (diagnosticsEnabled)
            diagnostics.firstBranchesConsidered++;
        const firstUpperExpected = a.expected + secondSummary.maxExpected + thirdSummary.maxExpected;
        if (!optimisticBoundCanBeat(a.samples, secondSummary.maxSamples, thirdSummary.maxSamples, targetScore, firstUpperExpected, bestHits, bestExpected, 'first')) {
            if (diagnosticsEnabled)
                diagnostics.firstBranchesPruned++;
            continue;
        }
        for (const b of second) {
            if (diagnosticsEnabled)
                diagnostics.pairBranchesConsidered++;
            const pairExpected = a.expected + b.expected;
            const pairUpperExpected = pairExpected + thirdSummary.maxExpected;
            if (!optimisticBoundCanBeat(a.samples, b.samples, thirdSummary.maxSamples, targetScore, pairUpperExpected, bestHits, bestExpected, 'pair')) {
                if (diagnosticsEnabled)
                    diagnostics.pairBranchesPruned++;
                continue;
            }
            for (let i = 0; i < n; i++) {
                pairSamples[i] = a.samples[i] + b.samples[i];
            }
            if (diagnosticsEnabled)
                diagnostics.survivingPairSampleBuilds++;
            for (const c of third) {
                if (diagnosticsEnabled)
                    diagnostics.triplesConsidered++;
                const expected = pairExpected + c.expected;
                let hits = 0;
                let abandoned = false;
                let checked = 0;
                for (let i = 0; i < n; i++) {
                    checked++;
                    if (pairSamples[i] + c.samples[i] >= targetScore)
                        hits++;
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
                recordScenarioChecks('triple', checked);
                if (diagnosticsEnabled) {
                    if (abandoned)
                        diagnostics.triplesEarlyTerminated++;
                    else
                        diagnostics.triplesCompleted++;
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
    if (diagnosticsEnabled)
        diagnostics.combinatorialSearchMs += nowMs() - diagnosticStart;
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