import { performance } from 'node:perf_hooks';

import { TOTAL_UNIFORM_MENUS } from '../docs/js/data/actionCatalog.js';
import { evaluateBoardTarget } from '../docs/js/engine/targetProbability.js';
import { createTerminalSearchRuntime } from '../docs/js/engine/optimizerTerminal.js';
import {
  ACTION_WIDENING_PRESETS,
  CONTINUATION_FIDELITY_PRESETS,
  createContinuationRuntime,
} from '../docs/js/engine/optimizerContinuation.js';
import { OPTIMIZER_ROLES } from '../docs/js/engine/optimizerHelpers.js';
import { getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';

const EPSILON = 1e-15;

export function rootActionKey(action) {
  return action.kind !== 'board_action'
    ? action.kind
    : `${action.kind}|${action.operationId}|${action.banner}`;
}

function clone(value) {
  return structuredClone(value);
}

function numericDelta(before, after) {
  if (typeof before === 'number' && typeof after === 'number') return after - before;
  if (Array.isArray(before) && Array.isArray(after)) {
    return after.map((value, i) => numericDelta(before[i] ?? 0, value));
  }
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    const out = {};
    for (const key of Object.keys(after)) {
      const value = after[key];
      if (typeof value === 'number' || Array.isArray(value) || (value && typeof value === 'object')) {
        out[key] = numericDelta(before[key], value);
      }
    }
    return out;
  }
  return after;
}

function runtimeSnapshot(terminal, continuation) {
  return {
    targetKernel: clone(getTargetSearchDiagnostics()),
    terminal: clone(terminal.diagnostics()),
    continuation: clone(continuation.diagnostics()),
    valueFunction: clone(continuation.valueFunction.getDiagnostics()),
    menuOperator: clone(continuation.menuModel.getDiagnostics()),
  };
}

function runtimeDelta(before, after) {
  return {
    targetKernel: numericDelta(before.targetKernel, after.targetKernel),
    terminal: numericDelta(before.terminal, after.terminal),
    continuation: numericDelta(before.continuation, after.continuation),
    valueFunction: numericDelta(before.valueFunction, after.valueFunction),
    menuOperator: numericDelta(before.menuOperator, after.menuOperator),
  };
}

function policyConfig(policy, modeledHorizon) {
  const continuation = CONTINUATION_FIDELITY_PRESETS[policy.continuation];
  const widening = ACTION_WIDENING_PRESETS[policy.widening];
  if (!continuation) throw new Error(`Unknown continuation preset: ${policy.continuation}`);
  if (!widening) throw new Error(`Unknown widening preset: ${policy.widening}`);
  return {
    experimentalFidelity: { modeledHorizon, policy: continuation },
    experimentalWidening: { modeledHorizon, policy: widening },
  };
}

function stableRank(rows, utilityField) {
  return rows
    .map((row, insertionOrder) => ({ ...row, insertionOrder }))
    .sort((a, b) => {
      const diff = b[utilityField] - a[utilityField];
      return Math.abs(diff) > EPSILON ? diff : a.insertionOrder - b.insertionOrder;
    });
}

export function selectAdaptiveContenders(rows, rule) {
  if (!rows.length) return [];
  const ranked = stableRank(rows, 'screenedUtility');
  const maxRefined = Math.max(0, Math.floor(rule.maxRefined ?? ranked.length));
  if (rule.kind === 'top_k') {
    const topK = Math.max(0, Math.floor(rule.topK ?? 0));
    return ranked.slice(0, Math.min(topK, maxRefined)).map((row, i) => ({
      key: row.key,
      reason: `screen-rank-${i + 1}-within-top-${topK}`,
    }));
  }
  if (rule.kind === 'winner_margin') {
    const delta = Number(rule.delta ?? 0);
    const winner = ranked[0].screenedUtility;
    return ranked
      .filter((row) => winner - row.screenedUtility <= delta + EPSILON)
      .slice(0, maxRefined)
      .map((row) => ({
        key: row.key,
        reason: `screen-gap-${(winner - row.screenedUtility).toFixed(12)}-within-${delta}`,
      }));
  }
  throw new Error(`Unknown adaptive refinement rule: ${rule.kind}`);
}

function createRuntime(state, data, terminal, uniformStatFallback, policy, modeledHorizon) {
  const { experimentalFidelity, experimentalWidening } = policyConfig(policy, modeledHorizon);
  return createContinuationRuntime(
    state,
    data,
    terminal,
    uniformStatFallback,
    experimentalFidelity,
    experimentalWidening,
  );
}

function boardActionDescriptor(operation, banner) {
  return {
    key: `board_action|${operation.id}|${banner}`,
    action: { kind: 'board_action', operationId: operation.id, banner },
    operation,
    banner,
  };
}

function rootDescriptors(state, screenRuntime) {
  const roots = [{ key: 'stop', action: { kind: 'stop' } }];
  for (const operation of state.menu) {
    for (const banner of OPTIMIZER_ROLES) {
      if (!screenRuntime.transitionsFor(screenRuntime.__initialEngine, banner, operation).length) continue;
      roots.push(boardActionDescriptor(operation, banner));
    }
  }
  if (state.tokensRemaining > 0) roots.push({ key: 'menu_reroll', action: { kind: 'menu_reroll' } });
  return roots;
}

function evaluateRootUtility(root, runtime, initialEngine, stopUtility, horizon) {
  if (root.action.kind === 'stop') return stopUtility;
  if (root.action.kind === 'menu_reroll') {
    if (statefulTokensAfter(horizon) === 0) return stopUtility;
    return runtime.valueFunction.V(initialEngine, Math.max(0, horizon - 1));
  }
  return runtime.targetedContinuation(initialEngine, root.operation, root.banner, horizon, 'current_menu').value;
}

function statefulTokensAfter(horizon) {
  return Math.max(0, horizon - 1);
}

function evaluateRootWithAttribution(pass, root, runtime, terminal, initialEngine, stopUtility, horizon, triggerReason) {
  const before = runtimeSnapshot(terminal, runtime);
  const started = performance.now();
  const utility = evaluateRootUtility(root, runtime, initialEngine, stopUtility, horizon);
  const elapsedMs = performance.now() - started;
  const after = runtimeSnapshot(terminal, runtime);
  return {
    utility,
    attribution: {
      pass,
      key: root.key,
      action: root.action,
      triggerReason: triggerReason ?? null,
      elapsedMs,
      work: runtimeDelta(before, after),
    },
  };
}

export function runAdaptiveTargetSearch(state, data, candidate, options = {}) {
  const uniformStatFallback = options.uniformStatFallback ?? true;
  const modeledHorizon = Math.max(3, Math.floor(options.modeledHorizon ?? 3));
  if (state.objective !== 'target_probability') throw new Error('M5H adaptive search is target-probability only.');
  if (modeledHorizon !== 3) throw new Error('M5H adaptive search is frozen to experimental horizon t=3.');

  const terminal = createTerminalSearchRuntime(state, data);
  const initialEngine = terminal.initialEngine;
  const current = evaluateBoardTarget(
    state.board,
    state.username,
    data,
    state.targetScore ?? 0,
    data.simulation.optimizerIterations,
  );
  const stopUtility = current.targetProbability ?? 0;
  terminal.seedCurrent(current);

  const screen = createRuntime(state, data, terminal, uniformStatFallback, candidate.screen, modeledHorizon);
  screen.__initialEngine = initialEngine;
  const refine = createRuntime(state, data, terminal, uniformStatFallback, candidate.refine, modeledHorizon);
  refine.__initialEngine = initialEngine;

  const initialization = {
    targetKernel: clone(getTargetSearchDiagnostics()),
    terminal: clone(terminal.diagnostics()),
  };

  const roots = rootDescriptors(state, screen);
  const passRecords = [];
  const rows = [];

  for (const root of roots) {
    const result = evaluateRootWithAttribution(
      'screen', root, screen, terminal, initialEngine, stopUtility, modeledHorizon, null,
    );
    passRecords.push(result.attribution);
    rows.push({
      key: root.key,
      action: root.action,
      root,
      screenedUtility: result.utility,
      refinedUtility: null,
      finalUtility: result.utility,
      refinementTriggerReason: null,
    });
  }

  const contenders = selectAdaptiveContenders(rows, candidate.rule);
  const triggerByKey = new Map(contenders.map((row) => [row.key, row.reason]));
  for (const row of rows) {
    const reason = triggerByKey.get(row.key);
    if (!reason) continue;
    row.refinementTriggerReason = reason;
    const result = evaluateRootWithAttribution(
      'refine', row.root, refine, terminal, initialEngine, stopUtility, modeledHorizon, reason,
    );
    passRecords.push(result.attribution);
    row.refinedUtility = result.utility;
    row.finalUtility = result.utility;
  }

  const ranked = stableRank(rows, 'finalUtility').map((row, index) => ({
    rank: index + 1,
    key: row.key,
    action: row.action,
    screenedUtility: row.screenedUtility,
    refinedUtility: row.refinedUtility,
    finalUtility: row.finalUtility,
    refinementTriggerReason: row.refinementTriggerReason,
  }));

  const screenRanked = stableRank(rows, 'screenedUtility');
  const screenWinner = screenRanked[0];
  const finalWinner = ranked[0];
  const finalRowsByKey = new Map(ranked.map((row) => [row.key, row]));

  return {
    candidateId: candidate.id,
    modeledHorizon,
    objective: 'target_probability',
    current,
    screenWinnerKey: screenWinner.key,
    finalWinnerKey: finalWinner.key,
    recommendation: finalWinner,
    ranking: ranked,
    contenders,
    diagnostics: {
      initialization,
      screenPolicy: clone(candidate.screen),
      refinePolicy: clone(candidate.refine),
      rule: clone(candidate.rule),
      rootAlternativesScreened: roots.length,
      rootAlternativesRefined: contenders.length,
      refinementChangedWinner: screenWinner.key !== finalWinner.key,
      refinementChangedNothing: contenders.every(({ key }) => {
        const row = finalRowsByKey.get(key);
        return row?.refinedUtility === row?.screenedUtility;
      }),
      passRecords,
      finalTerminal: terminal.diagnostics(),
      screenContinuation: screen.diagnostics(),
      screenValueFunction: screen.valueFunction.getDiagnostics(),
      screenMenuOperator: screen.menuModel.getDiagnostics(),
      refineContinuation: refine.diagnostics(),
      refineValueFunction: refine.valueFunction.getDiagnostics(),
      refineMenuOperator: refine.menuModel.getDiagnostics(),
      targetKernel: getTargetSearchDiagnostics(),
      futureMenuOperationCount: 20,
      freshMenuCombinations: TOTAL_UNIFORM_MENUS,
    },
  };
}
