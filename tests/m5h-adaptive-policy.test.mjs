import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { selectAdaptiveContenders } from '../scripts/m5h-adaptive-lib.mjs';

function rows(entries) {
  return entries.map(([key, screenedUtility]) => ({ key, screenedUtility }));
}

test('M5H top-k refinement includes stop/menu when ranked as contenders', () => {
  const selected = selectAdaptiveContenders(rows([
    ['stop', 0.610],
    ['board_action|x|core', 0.608],
    ['menu_reroll', 0.607],
  ]), { kind: 'top_k', topK: 2, maxRefined: 2 });
  assert.deepEqual(selected.map((x) => x.key), ['stop', 'board_action|x|core']);
});

test('M5H clearly separated screened winner triggers no margin refinement', () => {
  const selected = selectAdaptiveContenders(rows([
    ['board_action|x|core', 0.6100],
    ['board_action|y|mid', 0.6000],
    ['stop', 0.5990],
  ]), { kind: 'winner_margin', delta: 0.005, maxRefined: 3 });
  assert.deepEqual(selected, []);
});

test('M5H two close board actions are both eligible for margin refinement', () => {
  const selected = selectAdaptiveContenders(rows([
    ['board_action|x|core', 0.6000],
    ['board_action|y|mid', 0.5980],
    ['stop', 0.5900],
  ]), { kind: 'winner_margin', delta: 0.0025, maxRefined: 3 });
  assert.deepEqual(selected.map((x) => x.key), ['board_action|x|core', 'board_action|y|mid']);
});

test('M5H winner-margin refinement treats menu reroll identically to board actions', () => {
  const selected = selectAdaptiveContenders(rows([
    ['board_action|x|core', 0.6000],
    ['menu_reroll', 0.5976],
    ['stop', 0.5949],
  ]), { kind: 'winner_margin', delta: 0.0025, maxRefined: 3 });
  assert.deepEqual(selected.map((x) => x.key), ['board_action|x|core', 'menu_reroll']);
});

test('M5H close board action versus stop makes stop eligible under the same rule', () => {
  const selected = selectAdaptiveContenders(rows([
    ['board_action|x|core', 0.6000],
    ['stop', 0.5981],
    ['menu_reroll', 0.5900],
  ]), { kind: 'winner_margin', delta: 0.0025, maxRefined: 3 });
  assert.deepEqual(selected.map((x) => x.key), ['board_action|x|core', 'stop']);
});

test('M5H equal screened utilities use deterministic root insertion order', () => {
  const selected = selectAdaptiveContenders(rows([
    ['stop', 0.5],
    ['board_action|a|core', 0.5],
    ['menu_reroll', 0.5],
  ]), { kind: 'top_k', topK: 2, maxRefined: 2 });
  assert.deepEqual(selected.map((x) => x.key), ['stop', 'board_action|a|core']);
});

test('M5H candidate family is frozen at eight policies and retains the M5G baseline', () => {
  const config = JSON.parse(fs.readFileSync(new URL('../benchmarks/m5h-target-adaptive-candidates.json', import.meta.url), 'utf8'));
  assert.equal(config.frozenBeforeCalibration, true);
  assert.equal(config.candidates.length, 8);
  assert.deepEqual(config.baseline, { id: 'm5g-baseline', continuation: 'aggressive', widening: 'wide' });
  assert.ok(config.candidates.some((x) => x.rule.kind === 'top_k' && x.rule.topK === 2));
  assert.ok(config.candidates.some((x) => x.rule.kind === 'winner_margin'));
  assert.ok(config.notes.some((x) => x.includes('clearly separated winner triggers no refinement')));
});

test('M5H is structurally isolated from the production optimizer entry point', () => {
  const source = fs.readFileSync(new URL('../src/engine/optimizerRecommendation.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /m5h|adaptiveTarget|AdaptiveTarget/i);
  assert.match(source, /Math\.min\(data\.simulation\.maxLookaheadTokens\?\?2,2\)/);
});
