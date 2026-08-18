import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { expandedBoard, makeProductionSearchState } from './fixtures/productionSearchFixtures.mjs';

const raw = JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json', 'utf8'));
const titles = JSON.parse(fs.readFileSync('data/ti2026-title-model.json', 'utf8'));
const data = convertStatisticalModel(raw, titles);
const corpus = JSON.parse(fs.readFileSync('tests/fixtures/m6e-production-search-policy.json', 'utf8'));
const menu = () =>
  ['green-stat-all', 'red-quality-all', 'blue-trait-all'].map((id) => cloneAction(ACTION_BY_ID.get(id)));
const key = (action) =>
  action.kind === 'board_action' ? `board:${action.operationId}:${action.banner}` : action.kind;

test('production policy is generated from frozen M6D certification artifacts', () => {
  execFileSync(process.execPath, ['scripts/generate-m6e-policy.mjs', '--check'], { stdio: 'pipe' });
  const selection = JSON.parse(fs.readFileSync('benchmarks/m6d-selection.json', 'utf8'));
  assert.equal(selection.selectedCandidate, 'adaptive-tight');
  assert.equal(selection.outcome, 'A');
  assert.equal(selection.holdoutPassed, true);
  assert.equal(corpus.m6eBaseSha, '0e287bf38dd3259e21827245c4bd1c0811e48eba');
  assert.equal(corpus.layoutId, 'expanded_5');
  assert.equal(corpus.horizon, 2);
});

test('legacy_3 production remains exact and deterministic for both objectives', () => {
  for (const objective of ['expected_score', 'target_probability']) {
    const state = {
      board: structuredClone(defaultBoard),
      tokensRemaining: 2,
      menu: menu(),
      menuRerollAvailable: true,
      username: `Production legacy ${objective}`,
      objective,
      ...(objective === 'target_probability' ? { targetScore: 55000 } : {}),
    };
    const first = recommendNextAction(state, data, true);
    const firstDiagnostics = getLastOptimizerEngineDiagnostics();
    const second = recommendNextAction(state, data, true);
    const secondDiagnostics = getLastOptimizerEngineDiagnostics();
    assert.equal(firstDiagnostics.searchMode, 'exact');
    assert.equal(secondDiagnostics.searchMode, 'exact');
    assert.deepEqual(first.recommendation.action, second.recommendation.action);
    assert.equal(first.recommendation.expectedFinalUtility, second.recommendation.expectedFinalUtility);
  }
});

test('expanded_5 t=1 stays exact while production t=2 uses certified adaptive-tight', () => {
  const definition = corpus.cases.find((item) => item.id === 'm6e-exp-stat-clear');
  const state = makeProductionSearchState(definition);
  state.tokensRemaining = 1;
  recommendNextAction(state, data, true);
  assert.equal(getLastOptimizerEngineDiagnostics().searchMode, 'exact');

  state.tokensRemaining = 2;
  recommendNextAction(state, data, true);
  const diagnostics = getLastOptimizerEngineDiagnostics();
  assert.match(diagnostics.searchMode, /^expanded_t2_adaptive/);
  assert.equal(diagnostics.adaptiveRefinement?.policyId, 'adaptive-tight');
  assert.equal(diagnostics.modeledHorizon, 2);
});

test('explicit engineering t=2 override preserves the reference-oracle path', () => {
  const definition = corpus.cases.find((item) => item.id === 'm6e-exp-stat-clear');
  const state = makeProductionSearchState(definition);
  recommendNextAction(state, data, true, { modeledHorizonOverride: 2 });
  assert.equal(getLastOptimizerEngineDiagnostics().searchMode, 'exact');
});

test('K=6 ambiguity invokes exact fallback and reproduces the exact recommendation', () => {
  const definition = corpus.cases.find((item) => item.id === 'm6e-exp-stat-clear');
  const state = makeProductionSearchState(definition);
  const production = recommendNextAction(state, data, true);
  const productionDiagnostics = getLastOptimizerEngineDiagnostics();
  assert.equal(productionDiagnostics.searchMode, 'expanded_t2_adaptive_exact_fallback');
  assert.equal(productionDiagnostics.adaptiveRefinement?.exactFallback, true);
  assert.equal(productionDiagnostics.adaptiveRefinement?.finalStage, 'exact');

  const exact = recommendNextAction(state, data, true, {
    modeledHorizonOverride: 2,
    engineeringForceExact: true,
  });
  assert.equal(key(production.recommendation.action), key(exact.recommendation.action));
  assert.equal(production.recommendation.expectedFinalUtility, exact.recommendation.expectedFinalUtility);
});

test('expanded_5 t=2 production agrees with the engineering oracle on clear and close cases', () => {
  for (const id of ['m6e-exp-stat-clear', 'm6e-tgt-mixed-close']) {
    const definition = corpus.cases.find((item) => item.id === id);
    const state = makeProductionSearchState(definition);
    const production = recommendNextAction(state, data, true);
    const productionDiagnostics = getLastOptimizerEngineDiagnostics();
    const exact = recommendNextAction(state, data, true, {
      modeledHorizonOverride: 2,
      engineeringForceExact: true,
    });
    const exactDiagnostics = getLastOptimizerEngineDiagnostics();
    assert.match(productionDiagnostics.searchMode, /^expanded_t2_adaptive/);
    assert.equal(exactDiagnostics.searchMode, 'exact');
    assert.equal(key(production.recommendation.action), key(exact.recommendation.action));
    assert.equal(
      exact.ranking.find((row) => key(row.action) === key(production.recommendation.action))
        .expectedFinalUtility,
      exact.recommendation.expectedFinalUtility,
    );
  }
});

test('current production surface keeps t=3 and t=4 outside the supported search policy', () => {
  assert.equal(defaultBoard.layoutId ?? 'legacy_3', 'legacy_3');
  assert.equal(expandedBoard().layoutId, 'expanded_5');
  const sources = [
    'src/engine/expandedT2Adaptive.ts',
    'src/engine/expandedT2AdaptivePolicy.ts',
    'scripts/generate-m6e-policy.mjs',
  ]
    .map((path) => fs.readFileSync(path, 'utf8'))
    .join('\n');
  assert.doesNotMatch(sources, /m5h-target-holdout/i);
  assert.doesNotMatch(sources, /modeledHorizonOverride\s*:\s*[34]/);
  assert.doesNotMatch(sources, /\bhorizon\s*:\s*[34]\b/);
});
