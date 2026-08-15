import { compareTargetRuns } from './m5e-benchmark-lib.mjs';

const BASE_SHA = 'b5b9beae74138db46252eadaaa8d024bb7c29931';
const TARGET_SCORE = 55_000;
const MENU_IDS = ['green-stat-all', 'red-quality-all', 'blue-trait-all'];
const MAX_ORACLE_RSS_KB = 6 * 1024 * 1024;
const PAIR_CACHE_LIMIT = 256 * 1024 * 1024;
const SUFFIX_CACHE_LIMIT = 128 * 1024 * 1024;

function completed(run) { return run?.status === 'completed'; }
function sameArray(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function rowByKey(run, key) { return run?.ranking?.find((row) => row.key === key); }
function hasStopAndMenu(run) { return !!rowByKey(run, 'stop') && !!rowByKey(run, 'menu_reroll'); }
function cacheHealthy(run) {
  if (!completed(run)) return false;
  const d = run.targetKernelDiagnostics ?? {};
  return (d.pairCacheEstimatedBytes ?? 0) <= PAIR_CACHE_LIMIT
    && (d.suffixCacheEstimatedBytes ?? 0) <= SUFFIX_CACHE_LIMIT;
}

export function evaluateM5FGate(report) {
  const runs = Object.fromEntries((report.runs ?? []).map((run) => [run.id, run]));
  const baseline = runs['baseline-t3-aggressive-only'];
  const optimizedAggressive = runs['optimized-t3-aggressive-only'];
  const oracle = runs['optimized-t3-current-oracle'];
  const candidate = runs['optimized-t3-aggressive-wide'];
  const comparison = report.comparison ?? compareTargetRuns(oracle, candidate);
  const speedRatio = completed(baseline) && completed(optimizedAggressive)
    ? optimizedAggressive.runtimeMs / baseline.runtimeMs
    : null;

  const allCompleted = (report.runs ?? []).filter(completed);
  const operationIds = candidate?.futureOperationIds ?? oracle?.futureOperationIds ?? [];
  const candidatePolicy = completed(candidate)
    && candidate.fidelityId === 'aggressive'
    && candidate.wideningId === 'wide'
    && candidate.engineDiagnostics?.continuationFidelity?.id === 'aggressive'
    && sameArray(candidate.engineDiagnostics?.continuationFidelity?.freshMenuOutcomeStrataByDepth, [4, 2, 1])
    && candidate.engineDiagnostics?.actionWidening?.policyId === 'wide'
    && sameArray(candidate.engineDiagnostics?.actionWidening?.deepOperationCapsByDepth, [12, 8, 4]);
  const oraclePolicy = completed(oracle)
    && oracle.fidelityId === 'current'
    && oracle.wideningId === 'none'
    && oracle.engineDiagnostics?.continuationFidelity?.id === 'current'
    && oracle.engineDiagnostics?.actionWidening?.enabled === false;

  const checks = {
    preflightPassed: report.preflightPassed === true,
    genericKernelEquivalencePassed: report.preflightPassed === true,
    dotaFacingTargetSemanticsPassed: report.preflightPassed === true,
    t2RankedTargetRegressionPassed: report.preflightPassed === true,
    expectedScoreRegressionPassed: report.preflightPassed === true,
    productionHorizonUnchanged: report.productionHorizon === 2,
    engineeringSchedulesFrozen: sameArray(report.frozenExperiment?.continuationSchedule, [4, 2, 1])
      && sameArray(report.frozenExperiment?.wideningSchedule, [12, 8, 4]),
    baselineBaseShaExact: report.baseSha === BASE_SHA && baseline?.sourceSha === BASE_SHA,
    sameRunnerBaselineControl: report.sameRunnerBaselineControl === true,
    targetFixedAt55k: allCompleted.length > 0 && allCompleted.every((run) => run.targetScore === TARGET_SCORE),
    defaultMenuFixed: allCompleted.length > 0 && allCompleted.every((run) => sameArray(run.menuIds, MENU_IDS)),
    optimizedAggressiveCompleted: completed(optimizedAggressive),
    aggressiveSpeedRatioAtMost080: speedRatio !== null && speedRatio <= 0.80,
    oraclePolicyExact: oraclePolicy,
    oracleCompletedWithin600s: completed(oracle) && oracle.runtimeMs <= 600_000,
    oracleMaxRssUnder6Gb: completed(oracle) && oracle.memory?.maxRssEndKb < MAX_ORACLE_RSS_KB,
    candidatePolicyFrozen: candidatePolicy,
    candidateCompletedUnder60s: completed(candidate) && candidate.runtimeMs < 60_000,
    candidateWinnerMatchesOracle: comparison?.topActionAgreement === true,
    stopAndMenuRetained: hasStopAndMenu(oracle) && hasStopAndMenu(candidate),
    all20FutureOperationIdentitiesRepresented: operationIds.length === 20 && new Set(operationIds).size === 20,
    optimizedCachesBounded: cacheHealthy(optimizedAggressive) && cacheHealthy(oracle) && cacheHealthy(candidate),
    noOptimizedExecutionErrors: [optimizedAggressive, oracle, candidate].every((run) => run && run.status !== 'error'),
  };

  return {
    outcome: Object.values(checks).every(Boolean) ? 'A' : 'B',
    passed: Object.values(checks).every(Boolean),
    checks,
    aggressiveRuntimeRatio: speedRatio,
    comparison,
  };
}
