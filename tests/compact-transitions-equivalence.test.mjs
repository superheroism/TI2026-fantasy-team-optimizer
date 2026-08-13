import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTION_CATALOG } from '../docs/js/data/actionCatalog.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { BANNER_COLORS } from '../docs/js/domain/rules.js';
import { enumerateOperation } from '../docs/js/engine/transitions.js';
import {
  clearTransitionCache,
  enumerateEngineOperation,
  getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';
import {
  TRAIT_ORDER,
  boardAdapterContext,
  boardToEngineState,
  decodeBannerState,
  encodeBannerEmblemIds,
  encodeEmblemComponents,
  engineStateToBoard,
} from '../docs/js/engine/stateEncoding.js';

const ROLES = ['core','mid','support'];
const CONTEXT = { selectedTeam: 'Equivalence', expectedSeries: 5 };

function boardWithBanner(role, bannerId) {
  const board = structuredClone(defaultBoard);
  board[role] = decodeBannerState(role, bannerId, CONTEXT);
  return board;
}

function distributionById(outcomes, getId) {
  const map = new Map();
  for (const outcome of outcomes) {
    const id = getId(outcome);
    map.set(id, (map.get(id) ?? 0) + outcome.probability);
  }
  return map;
}

function assertProbabilityOne(outcomes, label) {
  const total = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  assert.ok(Math.abs(total - 1) < 1e-12, `${label}: probability ${total}`);
}

function assertEquivalent(board, role, op, uniformFallback = true) {
  const reference = enumerateOperation(board, role, op, uniformFallback);
  const engine = boardToEngineState(board);
  const compact = enumerateEngineOperation(engine, role, op, uniformFallback);
  assert.equal(compact.length, reference.length, `${role}/${op.id}: outcome count`);
  if (reference.length) {
    assertProbabilityOne(reference, `${role}/${op.id}/reference`);
    assertProbabilityOne(compact, `${role}/${op.id}/compact`);
  }

  const referenceMap = distributionById(reference, outcome => boardToEngineState(outcome.board).id);
  const compactMap = distributionById(compact, outcome => outcome.nextState.id);
  assert.equal(compactMap.size, referenceMap.size, `${role}/${op.id}: unique state count`);
  for (const [id, probability] of referenceMap) {
    assert.ok(compactMap.has(id), `${role}/${op.id}: missing compact state ${id}`);
    assert.ok(Math.abs(compactMap.get(id) - probability) < 1e-12, `${role}/${op.id}/${id}: probability mismatch`);
  }

  const context = boardAdapterContext(board);
  for (const outcome of compact) {
    const materialized = engineStateToBoard(outcome.nextState, context);
    assert.equal(outcome.nextState.core, role === 'core' ? boardToEngineState(materialized).core : engine.core);
    assert.equal(outcome.nextState.mid, role === 'mid' ? boardToEngineState(materialized).mid : engine.mid);
    assert.equal(outcome.nextState.support, role === 'support' ? boardToEngineState(materialized).support : engine.support);
  }
}

function bannerFromComponents(role, stats, qualities, traits) {
  const ids = [0,1,2].map(index => encodeEmblemComponents(stats[index], qualities[index], traits[index]));
  return encodeBannerEmblemIds(ids[0], ids[1], ids[2]);
}

function legalStatTuple(role, stats) {
  for (let a = 0; a < 3; a++) {
    for (let b = a + 1; b < 3; b++) {
      if (BANNER_COLORS[role][a] === BANNER_COLORS[role][b] && stats[a] === stats[b]) return false;
    }
  }
  return true;
}

test('compact stat rerolls match the reference across all legal role-local stat configurations and scopes', () => {
  const statOps = ACTION_CATALOG.filter(op => op.kind === 'stat_reroll');
  for (const role of ROLES) {
    for (let s0 = 0; s0 < 6; s0++) {
      for (let s1 = 0; s1 < 6; s1++) {
        for (let s2 = 0; s2 < 6; s2++) {
          const stats = [s0,s1,s2];
          if (!legalStatTuple(role, stats)) continue;
          const banner = bannerFromComponents(role, stats, [2,3,4], [0,1,2]);
          const board = boardWithBanner(role, banner);
          for (const op of statOps) assertEquivalent(board, role, op);
        }
      }
    }
  }
});

test('compact quality transitions match the reference for every quality triple including Tier-I/V waste', () => {
  const qualityOps = ACTION_CATALOG.filter(op => op.kind === 'quality_reroll' || op.kind === 'quality_increase' || op.kind === 'quality_redistribution');
  for (const role of ROLES) {
    for (let q0 = 1; q0 <= 5; q0++) {
      for (let q1 = 1; q1 <= 5; q1++) {
        for (let q2 = 1; q2 <= 5; q2++) {
          const banner = bannerFromComponents(role, [0,1,2], [q0,q1,q2], [0,1,2]);
          const board = boardWithBanner(role, banner);
          for (const op of qualityOps) assertEquivalent(board, role, op);
        }
      }
    }
  }
});

test('compact trait rerolls match the reference for every trait triple and random/first/last/all scopes', () => {
  const traitOps = ACTION_CATALOG.filter(op => op.kind === 'trait_reroll');
  for (const role of ROLES) {
    for (let t0 = 0; t0 < TRAIT_ORDER.length; t0++) {
      for (let t1 = 0; t1 < TRAIT_ORDER.length; t1++) {
        for (let t2 = 0; t2 < TRAIT_ORDER.length; t2++) {
          const banner = bannerFromComponents(role, [0,1,2], [2,3,4], [t0,t1,t2]);
          const board = boardWithBanner(role, banner);
          for (const op of traitOps) assertEquivalent(board, role, op);
        }
      }
    }
  }
});

test('weighted stat rerolls preserve weighting, duplicate exclusion, and no-uniform-fallback behavior', () => {
  const op = {
    id: 'weighted-red-test',
    label: 'weighted red test',
    kind: 'stat_reroll',
    color: 'red',
    scope: 'all_matching',
    excludeCurrent: true,
    outcomeWeights: {
      'Creep Score': 9,
      GPM: 3,
      Deaths: 1,
      'Tower Kills': 0,
      Madstone: -2,
      Kills: 4,
    },
  };
  const banner = bannerFromComponents('core', [0,1,1], [1,5,3], [4,0,2]);
  const board = boardWithBanner('core', banner);
  assertEquivalent(board, 'core', op, true);
  assertEquivalent(board, 'core', op, false);
});

test('compact transition cache is mechanics-only and records cold/warm aggregation diagnostics', () => {
  clearTransitionCache();
  resetTransitionDiagnostics();
  const engine = boardToEngineState(defaultBoard);
  const op = ACTION_CATALOG.find(candidate => candidate.id === 'quality-redistribution');
  assert.ok(op);

  const first = enumerateEngineOperation(engine, 'core', op, true);
  const cold = getTransitionDiagnostics();
  assert.equal(cold.cacheMisses, 1);
  assert.equal(cold.cacheHits, 0);
  assert.equal(cold.uniqueTransitionCalculations, 1);
  assert.ok(cold.outcomesBeforeAggregation >= cold.outcomesAfterAggregation);
  assert.ok(cold.outcomesAfterAggregation > 0);
  assert.ok(cold.transitionGenerationMs >= 0);

  const second = enumerateEngineOperation(engine, 'core', {...op, label: 'same mechanics, different label'}, true);
  const warm = getTransitionDiagnostics();
  assert.equal(warm.cacheMisses, 1);
  assert.equal(warm.cacheHits, 1);
  assert.deepEqual(second, first);
});
