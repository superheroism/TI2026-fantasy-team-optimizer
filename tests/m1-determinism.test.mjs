import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';
import { evaluateSelectedBoard } from '../docs/js/engine/scoring.js';

const raw = JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json', import.meta.url), 'utf8'));
const titles = JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json', import.meta.url), 'utf8'));

function smallBundle() {
  const data = convertStatisticalModel(raw, titles);
  data.simulation.iterations = 256;
  data.simulation.rankingIterations = 128;
  data.simulation.optimizerIterations = 24;
  data.simulation.maxLookaheadTokens = 1;
  return data;
}

test('independent bundles produce identical selected-board simulation output', () => {
  const a = evaluateSelectedBoard(structuredClone(defaultBoard), 'Regression', smallBundle());
  const b = evaluateSelectedBoard(structuredClone(defaultBoard), 'Regression', smallBundle());

  assert.equal(a.expected, b.expected);
  assert.equal(a.median, b.median);
  assert.equal(a.p10, b.p10);
  assert.equal(a.p90, b.p90);
  assert.deepEqual(a.samples, b.samples);
});

test('independent bundles produce identical optimizer recommendation', () => {
  const ids = ['green-stat-all', 'red-quality-all', 'blue-trait-all'];
  const buildState = () => ({
    board: structuredClone(defaultBoard),
    tokensRemaining: 1,
    menu: ids.map((id) => cloneAction(ACTION_BY_ID.get(id))),
    menuRerollAvailable: true,
    username: 'Regression',
    objective: 'expected_score',
  });

  const a = recommendNextAction(buildState(), smallBundle(), true);
  const b = recommendNextAction(buildState(), smallBundle(), true);

  assert.deepEqual(a.recommendation.action, b.recommendation.action);
  assert.equal(a.recommendation.expectedFinalUtility, b.recommendation.expectedFinalUtility);
  assert.equal(a.current.expected, b.current.expected);
});
