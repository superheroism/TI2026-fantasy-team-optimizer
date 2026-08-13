import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultBoard } from '../docs/js/data/defaultState.js';
import {
  evaluateBoardTargetProbabilityFast,
  getTargetDiagnostics,
  resetTargetDiagnostics,
  setTargetDiagnosticsEnabled,
} from '../docs/js/engine/targetProbability.js';
import { testData } from './test-data.mjs';

test('target diagnostics are opt-in and preserve target-probability semantics', () => {
  const data = testData({ optimizerIterations: 12 });
  const board = structuredClone(defaultBoard);

  resetTargetDiagnostics();
  setTargetDiagnosticsEnabled(false);
  const withoutDiagnostics = evaluateBoardTargetProbabilityFast(board, data, 55_000, 12);
  let snapshot = getTargetDiagnostics();
  assert.equal(snapshot.boardCacheHits, 0);
  assert.equal(snapshot.boardCacheMisses, 0);

  const diagnosticData = testData({ optimizerIterations: 12 });
  resetTargetDiagnostics();
  setTargetDiagnosticsEnabled(true);
  const withDiagnostics = evaluateBoardTargetProbabilityFast(board, diagnosticData, 55_000, 12);
  snapshot = getTargetDiagnostics();

  assert.equal(withDiagnostics, withoutDiagnostics);
  assert.equal(snapshot.boardCacheMisses, 1);
  assert.ok(snapshot.prefixesConsidered > 0);
  assert.ok(snapshot.candidatesBeforePruning.core > 0);
  assert.ok(snapshot.candidatesAfterPruning.core > 0);
  assert.ok(snapshot.scenarioChecks > 0);

  evaluateBoardTargetProbabilityFast(board, diagnosticData, 55_000, 12);
  snapshot = getTargetDiagnostics();
  assert.equal(snapshot.boardCacheHits, 1);

  setTargetDiagnosticsEnabled(false);
});
