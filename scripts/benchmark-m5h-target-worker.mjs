import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../docs/js/data/actionCatalog.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';
import { ACTION_WIDENING_PRESETS, CONTINUATION_FIDELITY_PRESETS } from '../docs/js/engine/optimizerContinuation.js';
import {
  clearTransitionCache,
  enumerateEngineOperation,
  getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';
import { getRawScenarioDiagnostics, resetRawScenarioDiagnostics } from '../docs/js/engine/scoring.js';
import { getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';
import {
  clearTargetSearchOptimizationCaches,
  getTargetSearchDiagnostics,
  resetTargetSearchDiagnostics,
  setTargetSearchDiagnosticsEnabled,
} from '../docs/js/engine/targetSearch.js';
import { runAdaptiveTargetSearch } from './m5h-adaptive-lib.mjs';

const [corpus, fixtureId, targetText, mode, candidateId] = process.argv.slice(2);
const targetScore = Number(targetText);
if (!['calibration', 'holdout', 'sentinel'].includes(corpus)) throw new Error('Invalid M5H corpus.');
if (!fixtureId || ![50_000, 55_000, 60_000].includes(targetScore)) throw new Error('Invalid M5H fixture/target.');
if (!['oracle', 'baseline', 'adaptive', 't2-current', 't2-experimental'].includes(mode)) throw new Error('Invalid M5H worker mode.');

const manifest = JSON.parse(fs.readFileSync(
  corpus === 'sentinel'
    ? new URL('../benchmarks/m5g-target-robustness-fixtures.json', import.meta.url)
    : new URL(`../benchmarks/m5h-target-${corpus}-fixtures.json`, import.meta.url),
  'utf8',
));
const fixture = manifest.fixtures.find((x) => x.id === fixtureId);
if (!fixture) throw new Error(`Unknown ${corpus} fixture: ${fixtureId}`);
const candidates = JSON.parse(fs.readFileSync(new URL('../benchmarks/m5h-target-adaptive-candidates.json', import.meta.url), 'utf8'));
const candidate = candidateId ? candidates.candidates.find((x) => x.id === candidateId) : undefined;
if ((mode === 'adaptive' || mode === 't2-experimental') && !candidate) throw new Error(`Unknown M5H candidate: ${candidateId}`);

const raw = JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json', import.meta.url), 'utf8'));
const titles = JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json', import.meta.url), 'utf8'));
const data = convertStatisticalModel(raw, titles);
const action = (id) => {
  const found = ACTION_BY_ID.get(id);
  if (!found) throw new Error(`Unknown operation: ${id}`);
  return cloneAction(found);
};
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

function memory() {
  const value = process.memoryUsage();
  return {
    heapUsed: value.heapUsed,
    heapTotal: value.heapTotal,
    rss: value.rss,
    external: value.external,
    arrayBuffers: value.arrayBuffers,
  };
}

function resetAll() {
  if (global.gc) global.gc();
  clearTransitionCache();
  clearTargetSearchOptimizationCaches();
  resetTransitionDiagnostics();
  resetRawScenarioDiagnostics();
  resetTargetDiagnostics();
  resetTargetSearchDiagnostics();
  setTargetDiagnosticsEnabled(true);
  setTargetSearchDiagnosticsEnabled(true);
}

function sentinelBoard() {
  const sourceManifest = JSON.parse(fs.readFileSync(new URL('../benchmarks/m5d-holdout-fixtures.json', import.meta.url), 'utf8'));
  const source = sourceManifest.fixtures.find((x) => x.name === fixtureId);
  if (!source) throw new Error(`Missing M5D replay source for sentinel ${fixtureId}`);
  const context = boardAdapterContext(defaultBoard);
  let engine = boardToEngineState(defaultBoard);
  for (const mutation of source.mutations) {
    if (String(engine.id) !== mutation.beforeBoardId) throw new Error(`${fixtureId}: sentinel before BoardStateID mismatch`);
    const outcomes = enumerateEngineOperation(engine, mutation.role, action(mutation.operationId), true);
    if (outcomes.length !== mutation.outcomeCount) throw new Error(`${fixtureId}: sentinel outcome-count mismatch`);
    const outcome = outcomes[mutation.outcomeIndex];
    if (!outcome) throw new Error(`${fixtureId}: sentinel outcome missing`);
    if (String(outcome.nextState.id) !== mutation.afterBoardId) throw new Error(`${fixtureId}: sentinel after BoardStateID mismatch`);
    engine = outcome.nextState;
  }
  return engineStateToBoard(engine, context);
}

function stateForFixture() {
  const board = corpus === 'sentinel' ? sentinelBoard() : structuredClone(fixture.descriptiveBoard);
  const engine = boardToEngineState(board);
  const expectedId = String(fixture.boardStateId);
  if (String(engine.id) !== expectedId) throw new Error(`${fixtureId}: BoardStateID reconstruction mismatch ${engine.id} != ${expectedId}`);
  return {
    board,
    tokensRemaining: manifest.tokensRemaining ?? 10,
    menu: fixture.menu.map(action),
    menuRerollAvailable: manifest.menuRerollAvailable ?? true,
    username: `M5H ${corpus} ${fixtureId} ${targetScore}`,
    objective: 'target_probability',
    targetScore,
  };
}

function normalizeStandard(result) {
  const ranking = result.ranking.map((row, index) => ({
    rank: index + 1,
    key: row.action.kind !== 'board_action' ? row.action.kind : `${row.action.kind}|${row.action.operationId}|${row.action.banner}`,
    utility: row.expectedFinalUtility,
    expectedScore: row.expectedFinalScore,
    tokensAfter: row.tokensAfter,
  }));
  return {
    recommendationKey: ranking[0].key,
    utility: ranking[0].utility,
    ranking,
    expectedScoreDiagnostic: ranking[0].expectedScore,
    futureMenuMode: result.futureMenuMode,
  };
}

function normalizeAdaptive(result) {
  const ranking = result.ranking.map((row) => ({
    rank: row.rank,
    key: row.key,
    utility: row.finalUtility,
    screenedUtility: row.screenedUtility,
    refinedUtility: row.refinedUtility,
    refinementTriggerReason: row.refinementTriggerReason,
  }));
  return {
    recommendationKey: result.finalWinnerKey,
    utility: ranking[0].utility,
    ranking,
    screenWinnerKey: result.screenWinnerKey,
    adaptiveDiagnostics: result.diagnostics,
  };
}

resetAll();
const state = stateForFixture();
const startMemory = memory();
const startMaxRssKb = process.resourceUsage().maxRSS;
const started = performance.now();
let normalized;
let horizon;
let fidelityId;
let wideningId;

if (mode === 'oracle') {
  horizon = 3;
  fidelityId = 'current';
  wideningId = 'none';
  normalized = normalizeStandard(recommendNextAction(state, data, true, { modeledHorizonOverride: 3 }));
} else if (mode === 'baseline') {
  horizon = 3;
  fidelityId = 'aggressive';
  wideningId = 'wide';
  normalized = normalizeStandard(recommendNextAction(state, data, true, {
    modeledHorizonOverride: 3,
    experimentalContinuationFidelity: CONTINUATION_FIDELITY_PRESETS.aggressive,
    experimentalActionWidening: ACTION_WIDENING_PRESETS.wide,
  }));
} else if (mode === 'adaptive') {
  horizon = 3;
  fidelityId = `adaptive:${candidate.id}`;
  wideningId = 'adaptive';
  normalized = normalizeAdaptive(runAdaptiveTargetSearch(state, data, candidate, { modeledHorizon: 3 }));
} else if (mode === 't2-current') {
  horizon = 2;
  fidelityId = 'current';
  wideningId = 'none';
  normalized = normalizeStandard(recommendNextAction(state, data, true, { modeledHorizonOverride: 2 }));
} else {
  horizon = 2;
  fidelityId = candidate.screen.continuation;
  wideningId = candidate.screen.widening;
  normalized = normalizeStandard(recommendNextAction(state, data, true, {
    modeledHorizonOverride: 2,
    experimentalContinuationFidelity: CONTINUATION_FIDELITY_PRESETS[candidate.screen.continuation],
    experimentalActionWidening: ACTION_WIDENING_PRESETS[candidate.screen.widening],
  }));
}

const runtimeMs = performance.now() - started;
const endMemory = memory();
const maxRssBytes = Math.max(startMaxRssKb * 1024, process.resourceUsage().maxRSS * 1024);
setTargetDiagnosticsEnabled(false);
setTargetSearchDiagnosticsEnabled(false);

process.stdout.write(`${JSON.stringify({
  sourceSha,
  corpus,
  fixtureId,
  reachabilityClass: fixture.reachabilityClass ?? fixture.reachability ?? 'unknown',
  boardStateId: String(fixture.boardStateId),
  targetScore,
  mode,
  candidateId: candidate?.id ?? null,
  horizon,
  fidelityId,
  wideningId,
  objective: 'target_probability',
  menuIds: [...fixture.menu],
  tokensRemaining: state.tokensRemaining,
  menuRerollAvailable: state.menuRerollAvailable,
  runtimeMs,
  ...normalized,
  memory: {
    start: startMemory,
    end: endMemory,
    maxRssBytes,
    heapDelta: endMemory.heapUsed - startMemory.heapUsed,
  },
  transitionDiagnostics: getTransitionDiagnostics(),
  rawScenarioDiagnostics: getRawScenarioDiagnostics(),
  targetDiagnostics: getTargetDiagnostics(),
  targetKernelDiagnostics: getTargetSearchDiagnostics(),
  futureOperationIds: ACTION_CATALOG.map((x) => x.id),
  runner: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    osRelease: os.release(),
    cpu: os.cpus()[0]?.model ?? null,
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
}, null, 2)}\n`);
