import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { actionFamily, actionType } from './m5g-benchmark-lib.mjs';
import {
  evaluateHoldout,
  isM5HHoldoutArtifactPath,
  readNamedArtifacts,
} from './m5h-benchmark-lib.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactRoot = path.resolve(process.argv[2] ?? path.join(root, 'm5h-holdout-artifacts'));
const reportPath = path.resolve(process.argv[3] ?? path.join(root, 'benchmarks/m5h-target-adaptive-holdout.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5h-target-holdout-fixtures.json'), 'utf8'));
const gate = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5h-target-holdout-gate.json'), 'utf8'));
const selected = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5h-selected-candidate.json'), 'utf8'));
const artifacts = readNamedArtifacts(artifactRoot, isM5HHoldoutArtifactPath);
const values = artifacts.map((row) => row.value);
const oracleRuns = values.filter((x) => x.mode === 'oracle');
const adaptiveRuns = values.filter((x) => x.mode === 'adaptive');
const t2CurrentRuns = values.filter((x) => x.mode === 't2-current');
const t2ExperimentalRuns = values.filter((x) => x.mode === 't2-experimental');
const gateResult = evaluateHoldout({ manifest, gate, oracleRuns, adaptiveRuns, t2CurrentRuns, t2ExperimentalRuns });
const oracleByCase = new Map(oracleRuns.map((x) => [`${x.fixtureId}|${x.targetScore}`, x]));

function oracleRegretForKey(oracle, key) {
  if (!oracle || oracle.status !== 'completed') return null;
  const chosen = oracle.ranking.find((row) => row.key === key);
  return chosen ? Math.max(0, oracle.utility - chosen.utility) : null;
}

function summarizeGroup(runs) {
  const completed = runs.filter((x) => x.status === 'completed');
  const rows = completed.map((run) => {
    const oracle = oracleByCase.get(`${run.fixtureId}|${run.targetScore}`);
    const finalRegret = oracleRegretForKey(oracle, run.recommendationKey);
    return { run, oracle, finalRegret };
  });
  return {
    cases: runs.length,
    completed: completed.length,
    agreements: rows.filter(({ run, oracle }) => oracle?.recommendationKey === run.recommendationKey).length,
    meanRegret: rows.reduce((sum, row) => sum + (row.finalRegret ?? 0), 0) / Math.max(1, runs.length),
    maxRegret: Math.max(0, ...rows.map((row) => row.finalRegret ?? 0)),
    meanRuntimeMs: completed.reduce((sum, run) => sum + run.runtimeMs, 0) / Math.max(1, completed.length),
  };
}

const perCase = adaptiveRuns.map((run) => {
  const oracle = oracleByCase.get(`${run.fixtureId}|${run.targetScore}`);
  const diagnostics = run.adaptiveDiagnostics;
  const screenRegret = run.status === 'completed' ? oracleRegretForKey(oracle, run.screenWinnerKey) : null;
  const finalRegret = run.status === 'completed' ? oracleRegretForKey(oracle, run.recommendationKey) : null;
  const screenRecords = diagnostics?.passRecords?.filter((x) => x.pass === 'screen') ?? [];
  const refineRecords = diagnostics?.passRecords?.filter((x) => x.pass === 'refine') ?? [];
  const sum = (records, selector) => records.reduce((total, row) => total + (selector(row) ?? 0), 0);
  const screenKernelChecks = sum(screenRecords, (x) => x.work?.targetKernel?.scenarioChecks);
  const refineKernelChecks = sum(refineRecords, (x) => x.work?.targetKernel?.scenarioChecks);
  const screenElapsedMs = sum(screenRecords, (x) => x.elapsedMs);
  const refineElapsedMs = sum(refineRecords, (x) => x.elapsedMs);
  const screenCorrect = oracle?.recommendationKey === run.screenWinnerKey;
  const finalCorrect = oracle?.recommendationKey === run.recommendationKey;
  return {
    fixtureId: run.fixtureId,
    reachabilityClass: run.reachabilityClass,
    targetScore: run.targetScore,
    status: run.status,
    oracleWinnerKey: oracle?.recommendationKey ?? null,
    screenWinnerKey: run.screenWinnerKey ?? null,
    finalWinnerKey: run.recommendationKey ?? null,
    screenCorrect,
    finalCorrect,
    screenRegret,
    finalRegret,
    regretRecoveredByRefinement: screenRegret === null || finalRegret === null ? null : screenRegret - finalRegret,
    refinementTriggered: (diagnostics?.rootAlternativesRefined ?? 0) > 0,
    rootAlternativesRefined: diagnostics?.rootAlternativesRefined ?? 0,
    refinementChangedWinner: diagnostics?.refinementChangedWinner ?? false,
    refinementChangedNothing: diagnostics?.refinementChangedNothing ?? false,
    screenElapsedMs,
    refinementElapsedMs: refineElapsedMs,
    screenKernelScenarioChecks: screenKernelChecks,
    refinementKernelScenarioChecks: refineKernelChecks,
    correctedScreenError: !screenCorrect && finalCorrect,
    introducedError: screenCorrect && !finalCorrect,
    finalActionFamily: run.recommendationKey ? actionFamily(run.recommendationKey) : null,
    finalActionType: run.recommendationKey ? actionType(run.recommendationKey) : null,
  };
});

const byThreshold = Object.fromEntries(manifest.thresholds.map((target) => [String(target), summarizeGroup(adaptiveRuns.filter((x) => x.targetScore === target))]));
const reachabilityClasses = [...new Set(manifest.fixtures.map((x) => x.reachabilityClass))];
const byReachabilityClass = Object.fromEntries(reachabilityClasses.map((value) => [value, summarizeGroup(adaptiveRuns.filter((x) => x.reachabilityClass === value))]));
const actionFamilies = [...new Set(adaptiveRuns.filter((x) => x.recommendationKey).map((x) => actionFamily(x.recommendationKey)))];
const byRootActionFamily = Object.fromEntries(actionFamilies.map((value) => [value, summarizeGroup(adaptiveRuns.filter((x) => x.recommendationKey && actionFamily(x.recommendationKey) === value))]));
const byRootActionType = {
  board_action: summarizeGroup(adaptiveRuns.filter((x) => x.recommendationKey && actionType(x.recommendationKey) === 'board_action')),
  stop_or_menu: summarizeGroup(adaptiveRuns.filter((x) => x.recommendationKey && actionType(x.recommendationKey) !== 'board_action')),
};
const completedCases = perCase.filter((x) => x.status === 'completed');
const adaptiveDiagnostics = {
  casesTriggeringRefinement: completedCases.filter((x) => x.refinementTriggered).length,
  meanRootAlternativesRefined: completedCases.reduce((sum, x) => sum + x.rootAlternativesRefined, 0) / Math.max(1, completedCases.length),
  screenVsOracleAgreements: completedCases.filter((x) => x.screenCorrect).length,
  finalVsOracleAgreements: completedCases.filter((x) => x.finalCorrect).length,
  totalRegretRecoveredByRefinement: completedCases.reduce((sum, x) => sum + (x.regretRecoveredByRefinement ?? 0), 0),
  incrementalRefinementRuntimeMs: completedCases.reduce((sum, x) => sum + x.refinementElapsedMs, 0),
  kernelChecksAddedByRefinement: completedCases.reduce((sum, x) => sum + x.refinementKernelScenarioChecks, 0),
  casesWhereRefinementChangedNothing: completedCases.filter((x) => x.refinementChangedNothing).length,
  casesWhereRefinementCorrectedScreenError: completedCases.filter((x) => x.correctedScreenError).length,
  casesWhereRefinementIntroducedError: completedCases.filter((x) => x.introducedError).length,
  perCase,
  byThreshold,
  byReachabilityClass,
  byRootActionFamily,
  byRootActionType,
};

const report = {
  schemaVersion: 1,
  package: 'M5H Adaptive Target-Probability t=3 Precision',
  corpus: 'holdout',
  generatedAt: new Date().toISOString(),
  holdoutSeed: manifest.seed,
  selectedCandidateId: selected.candidateId,
  selectedCandidate: selected.candidate,
  holdoutRetuningPermitted: false,
  artifactFilter: 'isM5HHoldoutArtifactPath',
  admittedArtifactCount: artifacts.length,
  sourceShas: [...new Set(artifacts.map((row) => row.value.sourceSha).filter(Boolean))],
  gate: gateResult,
  adaptiveDiagnostics,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  outcome: gateResult.outcome,
  passed: gateResult.passed,
  selectedCandidateId: selected.candidateId,
  admittedArtifactCount: artifacts.length,
  reportPath,
}, null, 2));
