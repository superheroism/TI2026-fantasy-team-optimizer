import fs from 'node:fs';
import path from 'node:path';

import {
  actionType,
  compareCase,
  monotonicUtilities,
  percentile,
  rankingsEqual,
} from './m5g-benchmark-lib.mjs';

const EPS = 1e-12;
export const M5H_MEMORY_GUARD_BYTES = 6 * 1024 * 1024 * 1024;
export const M5H_THRESHOLDS = [50_000, 55_000, 60_000];

export function isM5HCalibrationArtifactPath(filePath) {
  const name = filePath.replaceAll('\\', '/').split('/').at(-1) ?? '';
  return /^m5h-(?:oracle|adaptive-A[1-8]|t2-current|t2-experimental-A1)-calibration-0[1-9]-(?:50000|55000|60000)\.json$/.test(name);
}

export function isM5HHoldoutArtifactPath(filePath) {
  const name = filePath.replaceAll('\\', '/').split('/').at(-1) ?? '';
  return /^m5h-(?:oracle|adaptive|t2-current|t2-experimental)-holdout-0[1-9]-(?:50000|55000|60000)\.json$/.test(name);
}

export function walkJsonFiles(rootDir) {
  const out = [];
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
    }
  };
  visit(rootDir);
  return out;
}

export function readNamedArtifacts(rootDir, predicate) {
  return walkJsonFiles(rootDir)
    .filter(predicate)
    .sort()
    .map((filePath) => ({ filePath, value: JSON.parse(fs.readFileSync(filePath, 'utf8')) }));
}

function completedUnder(run, limitMs) {
  return run?.status === 'completed' && run.runtimeMs < limitMs;
}

function rssUnder(run) {
  return run?.status === 'completed' && (run.memory?.maxRssBytes ?? Infinity) < M5H_MEMORY_GUARD_BYTES;
}

function all20(run) {
  return run?.status === 'completed'
    && run.futureOperationIds?.length === 20
    && new Set(run.futureOperationIds).size === 20;
}

function waivableBoardDisagreement(comparison) {
  return comparison
    && comparison.oracleType === 'board_action'
    && comparison.candidateType === 'board_action'
    && !comparison.stopMenuReversal
    && comparison.oracleTopTwoGap <= 0.01 + EPS
    && (comparison.oracleRegret ?? Infinity) <= 0.0025 + EPS;
}

function simplicityTuple(candidate) {
  return [candidate.rule.kind === 'top_k' ? 0 : 1, candidate.rule.maxRefined ?? 99, candidate.id];
}

function compareSimplicity(a, b) {
  const aa = simplicityTuple(a), bb = simplicityTuple(b);
  for (let i = 0; i < aa.length; i++) {
    if (aa[i] === bb[i]) continue;
    return aa[i] < bb[i] ? -1 : 1;
  }
  return 0;
}

function caseKey(run) {
  return `${run.fixtureId}|${run.targetScore}`;
}

export function evaluateCalibration({ manifest, candidateConfig, artifacts }) {
  const expectedCases = manifest.fixtures.length * manifest.thresholds.length;
  const values = artifacts.map((row) => row.value);
  const oracles = values.filter((run) => run.mode === 'oracle');
  const t2Current = values.filter((run) => run.mode === 't2-current');
  const t2Experimental = values.filter((run) => run.mode === 't2-experimental');
  const oracleByCase = new Map(oracles.map((run) => [caseKey(run), run]));
  const t2CurrentByCase = new Map(t2Current.map((run) => [caseKey(run), run]));
  const t2ExperimentalByCase = new Map(t2Experimental.map((run) => [caseKey(run), run]));

  const baseIntegrity = {
    expectedCases,
    oracleCount: oracles.length,
    allOraclesComplete: oracles.length === expectedCases && oracles.every((run) => completedUnder(run, 600_000)),
    oracleMemoryUnder6GiB: oracles.length === expectedCases && oracles.every(rssUnder),
    oracleAll20FutureOperations: oracles.length === expectedCases && oracles.every(all20),
    t2ControlCount: t2Current.length,
    t2ExperimentalCount: t2Experimental.length,
    productionIsolation: t2Current.length === expectedCases
      && t2Experimental.length === expectedCases
      && [...t2CurrentByCase].every(([key, run]) => rankingsEqual(run.ranking, t2ExperimentalByCase.get(key)?.ranking)),
  };

  const candidateResults = [];
  for (const candidate of candidateConfig.candidates) {
    const runs = values.filter((run) => run.mode === 'adaptive' && run.candidateId === candidate.id);
    const comparisons = [];
    for (const run of runs) {
      const oracle = oracleByCase.get(caseKey(run));
      if (oracle) {
        const comparison = compareCase(oracle, run);
        if (comparison) comparisons.push({ ...comparison, fixtureId: run.fixtureId, targetScore: run.targetScore });
      }
    }
    const disagreements = comparisons.filter((x) => !x.topActionAgreement);
    const nonWaivable = disagreements.filter((x) => !waivableBoardDisagreement(x));
    const regrets = comparisons.map((x) => x.oracleRegret ?? 0);
    const runtimes = runs.filter((run) => run.status === 'completed').map((run) => run.runtimeMs);
    const maxRegret = Math.max(0, ...regrets);
    const meanRegret = regrets.reduce((sum, value) => sum + value, 0) / Math.max(1, expectedCases);
    const runtimeP90 = percentile(runtimes, 0.90);
    const runtimeMedian = percentile(runtimes, 0.50);
    const checks = {
      complete: runs.length === expectedCases && runs.every((run) => run.status === 'completed'),
      under60s: runs.length === expectedCases && runs.every((run) => completedUnder(run, 60_000)),
      memoryUnder6GiB: runs.length === expectedCases && runs.every(rssUnder),
      all20FutureOperations: runs.length === expectedCases && runs.every(all20),
      comparisonComplete: comparisons.length === expectedCases,
      noStopMenuReversal: comparisons.every((x) => !x.stopMenuReversal),
      noNonWaivableRootReversal: nonWaivable.length === 0,
      maxRegret: maxRegret <= 0.0025 + EPS,
      meanRegret: meanRegret <= 0.0005 + EPS,
      sharedIntegrity: Object.entries(baseIntegrity).every(([key, value]) => key.endsWith('Count') || key === 'expectedCases' || value === true),
    };
    const qualifies = Object.values(checks).every(Boolean);
    candidateResults.push({
      candidateId: candidate.id,
      candidate,
      qualifies,
      checks,
      summary: {
        agreements: comparisons.filter((x) => x.topActionAgreement).length,
        disagreements: disagreements.length,
        waivableDisagreements: disagreements.length - nonWaivable.length,
        nonWaivableDisagreements: nonWaivable.length,
        meanOracleRegret: meanRegret,
        maxOracleRegret: maxRegret,
        runtimeMedianMs: runtimeMedian,
        runtimeP90Ms: runtimeP90,
        runtimeMaxMs: runtimes.length ? Math.max(...runtimes) : null,
        completedRuns: runtimes.length,
      },
      disagreements,
    });
  }

  const qualifying = candidateResults.filter((x) => x.qualifies).sort((a, b) => {
    if (Math.abs(a.summary.maxOracleRegret - b.summary.maxOracleRegret) > EPS) return a.summary.maxOracleRegret - b.summary.maxOracleRegret;
    if (a.summary.agreements !== b.summary.agreements) return b.summary.agreements - a.summary.agreements;
    if (a.summary.runtimeP90Ms !== b.summary.runtimeP90Ms) return a.summary.runtimeP90Ms - b.summary.runtimeP90Ms;
    if (a.summary.runtimeMedianMs !== b.summary.runtimeMedianMs) return a.summary.runtimeMedianMs - b.summary.runtimeMedianMs;
    return compareSimplicity(a.candidate, b.candidate);
  });

  return {
    outcome: qualifying.length ? 'candidate_selected' : 'C',
    baseIntegrity,
    candidateResults,
    selectedCandidate: qualifying[0]?.candidate ?? null,
    selectedCandidateId: qualifying[0]?.candidateId ?? null,
    selectionOrder: candidateConfig.calibrationSelectionOrder,
  };
}

export function evaluateHoldout({ manifest, gate, oracleRuns, adaptiveRuns, t2CurrentRuns, t2ExperimentalRuns }) {
  const expectedCases = manifest.fixtures.length * manifest.thresholds.length;
  const oracleByCase = new Map(oracleRuns.map((run) => [caseKey(run), run]));
  const adaptiveByCase = new Map(adaptiveRuns.map((run) => [caseKey(run), run]));
  const t2ExperimentalByCase = new Map(t2ExperimentalRuns.map((run) => [caseKey(run), run]));
  const comparisons = [];
  for (const run of adaptiveRuns) {
    const oracle = oracleByCase.get(caseKey(run));
    if (!oracle) continue;
    const comparison = compareCase(oracle, run);
    if (comparison) comparisons.push({ ...comparison, fixtureId: run.fixtureId, targetScore: run.targetScore });
  }
  const disagreements = comparisons.filter((x) => !x.topActionAgreement);
  const regrets = comparisons.map((x) => x.oracleRegret ?? 0);
  const meanRegret = regrets.reduce((sum, value) => sum + value, 0) / Math.max(1, expectedCases);
  const maxRegret = Math.max(0, ...regrets);
  const oneWaivable = disagreements.length === 1 && waivableBoardDisagreement(disagreements[0]);
  const fixtureIds = manifest.fixtures.map((x) => x.id);
  const monotone = fixtureIds.every((fixtureId) => {
    const oracleTriplet = M5H_THRESHOLDS.map((targetScore) => oracleByCase.get(`${fixtureId}|${targetScore}`)).filter(Boolean);
    const adaptiveTriplet = M5H_THRESHOLDS.map((targetScore) => adaptiveByCase.get(`${fixtureId}|${targetScore}`)).filter(Boolean);
    return monotonicUtilities(oracleTriplet) && monotonicUtilities(adaptiveTriplet);
  });
  const t2ByCase = new Map(t2CurrentRuns.map((run) => [caseKey(run), run]));
  const checks = {
    complete: oracleRuns.length === expectedCases && adaptiveRuns.length === expectedCases,
    allOraclesUnder600s: oracleRuns.length === expectedCases && oracleRuns.every((run) => completedUnder(run, gate.oracle.runtimeStrictlyLessThanMs)),
    allAdaptiveUnder60s: adaptiveRuns.length === expectedCases && adaptiveRuns.every((run) => completedUnder(run, gate.adaptive.runtimeStrictlyLessThanMs)),
    memoryUnder6GiB: [...oracleRuns, ...adaptiveRuns].every(rssUnder),
    productionIsolation: t2CurrentRuns.length === expectedCases
      && t2ExperimentalRuns.length === expectedCases
      && [...t2ByCase].every(([key, run]) => rankingsEqual(run.ranking, t2ExperimentalByCase.get(key)?.ranking)),
    all20FutureOperations: [...oracleRuns, ...adaptiveRuns].every(all20),
    thresholdMonotonicity: monotone,
    rootActionAgreement: comparisons.length === expectedCases
      && expectedCases - disagreements.length >= gate.policyQuality.minimumRootActionAgreements
      && (disagreements.length === 0 || oneWaivable),
    maxOneDisagreement: disagreements.length <= gate.policyQuality.maximumDisagreements,
    noStopMenuDisagreement: disagreements.every((x) => !x.stopMenuReversal),
    meanRegret: meanRegret <= gate.policyQuality.maxMeanOracleRegretProbability + EPS,
    maxRegret: maxRegret <= gate.policyQuality.maxOracleRegretProbability + EPS,
    productionHorizon: manifest.productionHorizon === 2,
  };
  const passed = Object.values(checks).every(Boolean);
  return {
    outcome: passed ? 'A' : 'B',
    passed,
    checks,
    comparisons,
    disagreements,
    summary: {
      agreements: comparisons.filter((x) => x.topActionAgreement).length,
      disagreements: disagreements.length,
      meanOracleRegret: meanRegret,
      maxOracleRegret: maxRegret,
      adaptiveMedianRuntimeMs: percentile(adaptiveRuns.filter((x) => x.status === 'completed').map((x) => x.runtimeMs), 0.5),
      adaptiveP90RuntimeMs: percentile(adaptiveRuns.filter((x) => x.status === 'completed').map((x) => x.runtimeMs), 0.9),
      oracleMedianRuntimeMs: percentile(oracleRuns.filter((x) => x.status === 'completed').map((x) => x.runtimeMs), 0.5),
      oracleP90RuntimeMs: percentile(oracleRuns.filter((x) => x.status === 'completed').map((x) => x.runtimeMs), 0.9),
    },
  };
}
