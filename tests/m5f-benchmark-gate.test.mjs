import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { evaluateM5FGate } from '../scripts/m5f-benchmark-lib.mjs';

const BASE_SHA = 'b5b9beae74138db46252eadaaa8d024bb7c29931';
const MENU_IDS = ['green-stat-all', 'red-quality-all', 'blue-trait-all'];
const OPERATIONS = Array.from({ length: 20 }, (_, i) => `op-${i}`);
const BEST = 'board_action|red-quality-all|core';

function ranking(bestKey = BEST) {
  return [
    { rank: 1, key: bestKey, utility: 0.42, expectedScore: 54_000 },
    { rank: 2, key: 'menu_reroll', utility: 0.40, expectedScore: 53_900 },
    { rank: 3, key: 'stop', utility: 0.39, expectedScore: 53_800 },
  ];
}

function run(id, { runtimeMs, fidelityId, wideningId, bestKey = BEST, sourceSha = 'optimized', maxRssEndKb = 1_000_000 } = {}) {
  const aggressive = fidelityId === 'aggressive';
  const wide = wideningId === 'wide';
  return {
    id,
    status: 'completed',
    sourceSha,
    horizon: 3,
    fidelityId,
    wideningId,
    targetScore: 55_000,
    menuIds: [...MENU_IDS],
    runtimeMs,
    recommendationKey: bestKey,
    utility: 0.42,
    ranking: ranking(bestKey),
    memory: { maxRssEndKb },
    engineDiagnostics: {
      continuationFidelity: aggressive
        ? { id: 'aggressive', freshMenuOutcomeStrataByDepth: [4, 2, 1] }
        : { id: 'current' },
      actionWidening: wide
        ? { enabled: true, policyId: 'wide', deepOperationCapsByDepth: [12, 8, 4] }
        : { enabled: false },
    },
    targetKernelDiagnostics: { pairCacheEstimatedBytes: 1024, suffixCacheEstimatedBytes: 1024 },
    futureOperationIds: [...OPERATIONS],
  };
}

function passingReport() {
  const baseline = run('baseline-t3-aggressive-only', { runtimeMs: 100_000, fidelityId: 'aggressive', wideningId: 'none', sourceSha: BASE_SHA });
  const optimized = run('optimized-t3-aggressive-only', { runtimeMs: 75_000, fidelityId: 'aggressive', wideningId: 'none' });
  const oracle = run('optimized-t3-current-oracle', { runtimeMs: 150_000, fidelityId: 'current', wideningId: 'none' });
  const candidate = run('optimized-t3-aggressive-wide', { runtimeMs: 55_000, fidelityId: 'aggressive', wideningId: 'wide' });
  return {
    preflightPassed: true,
    productionHorizon: 2,
    baseSha: BASE_SHA,
    sameRunnerBaselineControl: true,
    frozenExperiment: { continuationSchedule: [4, 2, 1], wideningSchedule: [12, 8, 4] },
    runs: [baseline, optimized, oracle, candidate],
  };
}

test('M5F plan freezes base SHA, target, schedules, horizons and ceilings', () => {
  const stdout = execFileSync(process.execPath, ['scripts/benchmark-m5f-target.mjs', '--plan'], { encoding: 'utf8' });
  const plan = JSON.parse(stdout);
  assert.equal(plan.baseSha, BASE_SHA);
  assert.equal(plan.targetScore, 55_000);
  assert.deepEqual(plan.menuIds, MENU_IDS);
  assert.equal(plan.productionHorizon, 2);
  assert.equal(plan.experimentHorizon, 3);
  assert.deepEqual(plan.continuationSchedule, [4, 2, 1]);
  assert.deepEqual(plan.wideningSchedule, [12, 8, 4]);
  assert.equal(plan.aggressiveRuntimeRatioCeiling, 0.80);
  assert.equal(plan.candidateRuntimeCeilingMs, 60_000);
  assert.equal(plan.oracleRuntimeCeilingMs, 600_000);
});

test('M5F gate accepts only the complete frozen Outcome A case', () => {
  const gate = evaluateM5FGate(passingReport());
  assert.equal(gate.outcome, 'A');
  assert.equal(gate.passed, true);
  assert.equal(gate.aggressiveRuntimeRatio, 0.75);
});

test('M5F gate rejects speed, candidate-time, root-fidelity, memory and base-SHA failures', () => {
  const cases = [
    (report) => { report.runs[1].runtimeMs = 80_001; },
    (report) => { report.runs[3].runtimeMs = 60_000; },
    (report) => { report.runs[3].recommendationKey = 'menu_reroll'; report.runs[3].ranking = ranking('menu_reroll'); },
    (report) => { report.runs[2].memory.maxRssEndKb = 6 * 1024 * 1024; },
    (report) => { report.baseSha = 'wrong'; },
    (report) => { report.runs[3].targetKernelDiagnostics.pairCacheEstimatedBytes = 256 * 1024 * 1024 + 1; },
  ];
  for (const mutate of cases) {
    const report = passingReport();
    mutate(report);
    assert.equal(evaluateM5FGate(report).outcome, 'B');
  }
});
