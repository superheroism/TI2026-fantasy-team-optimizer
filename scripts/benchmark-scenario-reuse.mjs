import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { LEGAL_STAT_POOLS } from '../docs/js/domain/rules.js';
import { recommendNextAction, formatAction } from '../docs/js/engine/optimizer.js';
import {
  evaluateBoardExpectedFast,
  getRawScenarioDiagnostics,
  resetRawScenarioDiagnostics,
} from '../docs/js/engine/scoring.js';
import { evaluateBoardTargetProbabilityFast } from '../docs/js/engine/targetProbability.js';

const raw = JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json', import.meta.url), 'utf8'));
const titles = JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json', import.meta.url), 'utf8'));
const counts = [48, 96, 192, 384];
const targetScore = 55_000;
const results = [];

function dataAt(iterations) {
  const data = convertStatisticalModel(raw, titles);
  data.simulation = {
    ...data.simulation,
    optimizerIterations: iterations,
    rankingIterations: iterations,
    maxLookaheadTokens: 2,
  };
  return data;
}

function timed(fn) {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
}

function optimizerState(objective) {
  return {
    board: structuredClone(defaultBoard),
    tokensRemaining: 10,
    menu: structuredClone(defaultMenu),
    menuRerollAvailable: true,
    username: 'M4 scenario benchmark',
    objective,
    ...(objective === 'target_probability' ? { targetScore } : {}),
  };
}

for (const objective of ['expected_score', 'target_probability']) {
  for (const iterations of counts) {
    const data = dataAt(iterations);
    const state = optimizerState(objective);
    resetRawScenarioDiagnostics();
    const run = timed(() => recommendNextAction(state, data, true));
    const row = {
      kind: 'optimizer_scale',
      objective,
      iterations,
      ms: run.ms,
      action: formatAction(run.value.recommendation.action, state),
      utility: run.value.recommendation.expectedFinalUtility,
      rawScenarios: getRawScenarioDiagnostics(),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
function changedBoard(kind) {
  const board = structuredClone(defaultBoard);
  const banner = board.mid;
  const emblem = banner.emblems[0];
  if (kind === 'quality') {
    emblem.qualityTier = emblem.qualityTier === 5 ? 4 : emblem.qualityTier + 1;
  } else if (kind === 'trait') {
    emblem.trait = TRAITS.find((trait) => trait !== emblem.trait);
  } else {
    const used = new Set(banner.emblems.map((entry) => entry.stat));
    const replacement = LEGAL_STAT_POOLS[emblem.color].find((stat) => stat !== emblem.stat && !used.has(stat));
    if (!replacement) throw new Error('No legal non-duplicate stat replacement found for scenario reuse benchmark.');
    emblem.stat = replacement;
  }
  return board;
}

for (const objective of ['expected_score', 'target_probability']) {
  for (const kind of ['stat', 'quality', 'trait']) {
    const data = dataAt(192);
    const base = structuredClone(defaultBoard);
    const variant = changedBoard(kind);
    if (objective === 'expected_score') evaluateBoardExpectedFast(base, data, 192);
    else evaluateBoardTargetProbabilityFast(base, data, targetScore, 192);
    resetRawScenarioDiagnostics();
    const run = timed(() => objective === 'expected_score'
      ? evaluateBoardExpectedFast(variant, data, 192)
      : evaluateBoardTargetProbabilityFast(variant, data, targetScore, 192));
    const row = {
      kind: 'board_change_reuse',
      objective,
      change: kind,
      iterations: 192,
      ms: run.ms,
      utility: run.value,
      rawScenarios: getRawScenarioDiagnostics(),
    };
    results.push(row);
    console.log(JSON.stringify(row));
  }
}

const jsonArg = process.argv.find((arg) => arg.startsWith('--json='));
if (jsonArg) {
  const path = jsonArg.slice('--json='.length);
  fs.writeFileSync(path, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`Wrote ${path}`);
}
