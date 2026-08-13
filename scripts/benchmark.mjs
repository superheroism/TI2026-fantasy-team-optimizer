import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction, formatAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { evaluateSelectedBoard, rankTeamsForRole } from '../docs/js/engine/scoring.js';
import { enumerateOperation } from '../docs/js/engine/transitions.js';
import {
  clearTransitionCache,
  enumerateEngineOperation,
  getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';
import { boardToEngineState } from '../docs/js/engine/stateEncoding.js';

const raw = JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json', import.meta.url), 'utf8'));
const titles = JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json', import.meta.url), 'utf8'));
const roles = ['core','mid','support'];

const menus = {
  default: ['green-stat-all', 'red-quality-all', 'blue-trait-all'],
  quality_heavy: ['quality-redistribution', 'red-quality-all', 'blue-trait-all'],
  stat_heavy: ['green-stat-all', 'red-stat-all', 'blue-stat-all'],
  global_quality: ['quality-increase-one', 'quality-redistribution', 'green-quality-all'],
  trait_heavy: ['green-trait-all', 'red-trait-all', 'blue-trait-all'],
};

const results = [];
const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
const jsonPath = jsonArg?.slice('--json='.length);

function timed(label, fn, meta = {}) {
  const start = performance.now();
  const value = fn();
  const ms = performance.now() - start;
  const row = { label, ms, ...meta };
  results.push(row);
  return { row, value };
}

function print(row, detail = '') {
  const throughput = row.workUnits
    ? ` ${Math.round(row.workUnits / Math.max(row.ms / 1000, 1e-9)).toLocaleString()} ${row.workUnitLabel ?? 'units'}/s`
    : '';
  console.log(`${row.label.padEnd(28)} ${row.ms.toFixed(1).padStart(8)} ms${throughput}${detail ? `  ${detail}` : ''}`);
}

// Transition microbenchmark: reference BoardState cloning versus compact cold/warm generation.
const engine = boardToEngineState(defaultBoard);
const transitionCalls = ACTION_CATALOG.length * roles.length;
let referenceOutcomeBoards = 0;
const referenceTransitions = timed(
  'transitions_reference',
  () => {
    let outcomes = 0;
    for (const op of ACTION_CATALOG) for (const role of roles) outcomes += enumerateOperation(defaultBoard, role, op, true).length;
    return outcomes;
  },
  { workUnits: transitionCalls, workUnitLabel: 'operation-role calls' },
);
referenceOutcomeBoards = referenceTransitions.value;
referenceTransitions.row.outcomeBoards = referenceOutcomeBoards;
referenceTransitions.row.allocationProxy = `${referenceOutcomeBoards} descriptive BoardState outcomes (recursive clones not counted)`;
print(referenceTransitions.row, `${referenceOutcomeBoards} final BoardState outcomes`);

clearTransitionCache();
resetTransitionDiagnostics();
const compactCold = timed(
  'transitions_compact_cold',
  () => {
    let outcomes = 0;
    for (const op of ACTION_CATALOG) for (const role of roles) outcomes += enumerateEngineOperation(engine, role, op, true).length;
    return outcomes;
  },
  { workUnits: transitionCalls, workUnitLabel: 'operation-role calls' },
);
compactCold.row.outcomes = compactCold.value;
compactCold.row.transitionDiagnostics = getTransitionDiagnostics();
compactCold.row.allocationProxy = '0 descriptive BoardState allocations inside transition enumeration';
print(compactCold.row, `${compactCold.value} compact outcomes`);

resetTransitionDiagnostics();
const warmRounds = 250;
const compactWarm = timed(
  'transitions_compact_warm',
  () => {
    let outcomes = 0;
    for (let round = 0; round < warmRounds; round++) {
      for (const op of ACTION_CATALOG) for (const role of roles) outcomes += enumerateEngineOperation(engine, role, op, true).length;
    }
    return outcomes;
  },
  { workUnits: transitionCalls * warmRounds, workUnitLabel: 'operation-role calls' },
);
compactWarm.row.outcomes = compactWarm.value;
compactWarm.row.transitionDiagnostics = getTransitionDiagnostics();
compactWarm.row.allocationProxy = '0 descriptive BoardState allocations inside transition enumeration';
print(compactWarm.row, `${getTransitionDiagnostics().cacheHits.toLocaleString()} cache hits`);

const selectedData = convertStatisticalModel(raw, titles);
const selected = timed(
  'selected_20k',
  () => evaluateSelectedBoard(structuredClone(defaultBoard), 'Benchmark', selectedData),
  { workUnits: selectedData.simulation.iterations, workUnitLabel: 'board-scenarios' },
);
selected.row.expected = selected.value.expected;
print(selected.row, `EV ${selected.value.expected.toFixed(1)}`);

const compare = timed(
  'core_comparison_6k',
  () => rankTeamsForRole('core', structuredClone(defaultBoard), selectedData, selectedData.simulation.rankingIterations),
);
compare.row.workUnits = selectedData.simulation.rankingIterations * compare.value.length;
compare.row.workUnitLabel = 'team-scenarios';
compare.row.bestTeam = compare.value[0]?.name ?? null;
print(compare.row, `best ${compare.value[0]?.name ?? '—'}`);

const switchedBoard = structuredClone(defaultBoard);
switchedBoard.core.selectedTeam = compare.value[1]?.team ?? switchedBoard.core.selectedTeam;
const cachedSwitch = timed(
  'team_switch_cached',
  () => rankTeamsForRole('core', switchedBoard, selectedData, selectedData.simulation.rankingIterations),
);
cachedSwitch.row.selectedTeam = switchedBoard.core.selectedTeam;
print(cachedSwitch.row, `selected ${switchedBoard.core.selectedTeam}`);

for (const [name, ids] of Object.entries(menus)) {
  const data = convertStatisticalModel(raw, titles);
  const menu = ids.map((id) => cloneAction(ACTION_BY_ID.get(id)));
  const state = {
    board: structuredClone(defaultBoard),
    tokensRemaining: 10,
    menu,
    menuRerollAvailable: true,
    username: 'Benchmark',
    objective: 'expected_score',
  };

  clearTransitionCache();
  resetTransitionDiagnostics();
  const cold = timed(`optimizer_${name}_cold`, () => recommendNextAction(state, data, true));
  cold.row.action = formatAction(cold.value.recommendation.action, state);
  cold.row.utility = cold.value.recommendation.expectedFinalUtility;
  cold.row.transitionDiagnostics = getTransitionDiagnostics();
  cold.row.engineDiagnostics = getLastOptimizerEngineDiagnostics();
  print(cold.row, cold.row.action);

  resetTransitionDiagnostics();
  const warm = timed(`optimizer_${name}_warm`, () => recommendNextAction(state, data, true));
  warm.row.action = formatAction(warm.value.recommendation.action, state);
  warm.row.utility = warm.value.recommendation.expectedFinalUtility;
  warm.row.transitionDiagnostics = getTransitionDiagnostics();
  warm.row.engineDiagnostics = getLastOptimizerEngineDiagnostics();
  print(warm.row, warm.row.action);
}

{
  const data = convertStatisticalModel(raw, titles);
  const menu = menus.default.map((id) => cloneAction(ACTION_BY_ID.get(id)));
  const state = {
    board: structuredClone(defaultBoard),
    tokensRemaining: 10,
    menu,
    menuRerollAvailable: true,
    username: 'Benchmark',
    objective: 'target_probability',
    targetScore: 55_000,
  };

  clearTransitionCache();
  resetTransitionDiagnostics();
  const cold = timed('optimizer_target_55k_cold', () => recommendNextAction(state, data, true));
  cold.row.action = formatAction(cold.value.recommendation.action, state);
  cold.row.utility = cold.value.recommendation.expectedFinalUtility;
  cold.row.transitionDiagnostics = getTransitionDiagnostics();
  cold.row.engineDiagnostics = getLastOptimizerEngineDiagnostics();
  print(cold.row, cold.row.action);

  resetTransitionDiagnostics();
  const warm = timed('optimizer_target_55k_warm', () => recommendNextAction(state, data, true));
  warm.row.action = formatAction(warm.value.recommendation.action, state);
  warm.row.utility = warm.value.recommendation.expectedFinalUtility;
  warm.row.transitionDiagnostics = getTransitionDiagnostics();
  warm.row.engineDiagnostics = getLastOptimizerEngineDiagnostics();
  print(warm.row, warm.row.action);
}

if (jsonPath) {
  const report = {
    generatedAt: new Date().toISOString(),
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    simulation: {
      iterations: selectedData.simulation.iterations,
      rankingIterations: selectedData.simulation.rankingIterations,
      optimizerIterations: selectedData.simulation.optimizerIterations,
      maxLookaheadTokens: selectedData.simulation.maxLookaheadTokens,
    },
    results,
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Wrote benchmark report to ${jsonPath}`);
}
