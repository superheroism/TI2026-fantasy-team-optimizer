import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { validateScreenshotImport } from '../docs/js/import/screenshotImport.js';

const team = 'Team Liquid';
const data = { players: [ { role:'core', team }, { role:'mid', team }, { role:'support', team } ] };
const menu = structuredClone(defaultMenu);

function rawFromBoard(board, overrides = {}) {
  return {
    layoutId: board.layoutId ?? 'legacy_3',
    banners: Object.fromEntries(['core','mid','support'].map(role => [role, {
      selectedTeam: team,
      emblems: board[role].emblems.map(emblem => ({ position:emblem.position, color:emblem.color, stat:emblem.stat, qualityTier:emblem.qualityTier, trait:emblem.trait })),
    }])),
    operationIds: ['green-stat-all','red-quality-all','blue-trait-all'], fieldConfidence: [], warnings: [], ...overrides,
  };
}

test('validated screenshot import accepts both layouts and preserves expected-series inputs', () => {
  const current = createDefaultBoard('legacy_3');
  current.core.expectedSeries = 7; current.mid.expectedSeries = 6; current.support.expectedSeries = 4;
  const expanded = createDefaultBoard('expanded_5');
  const result = validateScreenshotImport(rawFromBoard(expanded, { tokensRemaining:8 }), data, current, menu);
  assert.equal(result.board.layoutId, 'expanded_5');
  assert.equal(result.board.core.emblems.length, 5);
  assert.equal(result.board.core.expectedSeries, 7); assert.equal(result.board.mid.expectedSeries, 6); assert.equal(result.board.support.expectedSeries, 4);
  assert.equal(result.tokensRemaining, 8);
  assert.deepEqual(result.menu.map(action => action.id), ['green-stat-all','red-quality-all','blue-trait-all']);
  assert.equal(result.requiresReview, false);
});

test('low-confidence emblem field requires review without invalidating an otherwise legal import', () => {
  const current = createDefaultBoard('legacy_3');
  const raw = rawFromBoard(current, { fieldConfidence:[{path:'banners.core.emblems.1.trait',confidence:0.72,reason:'fuzzy-trait'}], warnings:['Core emblem 2 trait is difficult to read.'] });
  const result = validateScreenshotImport(raw, data, current, menu);
  assert.equal(result.requiresReview, true);
  assert.deepEqual(result.lowConfidenceFields, [{ path:'banners.core.emblems.1.trait', confidence:0.72, reason:'fuzzy-trait' }]);
});

test('resolved warning text does not force review when calibrated fields are confident', () => {
  const current = createDefaultBoard('legacy_3');
  const diagnosticWarning='core emblem 2 OCR should be reviewed.';
  const raw = rawFromBoard(current, { fieldConfidence:[{path:'banners.core.emblems.1.trait',confidence:0.96,reason:'targeted-native-trait'}], warnings:[diagnosticWarning] });
  const result = validateScreenshotImport(raw, data, current, menu);
  assert.equal(result.requiresReview, false);
  assert.equal(result.lowConfidenceFields.length, 0);
  assert.ok(result.warnings.includes(diagnosticWarning), 'original warning remains available diagnostically');
  assert.equal(result.warnings.filter(warning=>warning===diagnosticWarning).length, 1, 'original diagnostic warning is not duplicated');
});

test('confidence diagnostics preserve final reason and component evidence', () => {
  const current = createDefaultBoard('legacy_3');
  const components={geometry:1,domainMatch:1,structuredEvidence:.97,targetedRetry:0,fieldConsistency:1};
  const result=validateScreenshotImport(rawFromBoard(current,{fieldConfidence:[{path:'banners.core.emblems.0.stat',confidence:.97,reason:'exact-domain-stat',components}]}),data,current,menu);
  assert.deepEqual(result.lowConfidenceFields,[]);
  assert.equal(result.requiresReview,false);
});

test('missing reroll actions preserve existing menu and become zero-confidence review fields', () => {
  const current = createDefaultBoard('expanded_5');
  const raw = rawFromBoard(current, { operationIds:[null,null,null] });
  const result = validateScreenshotImport(raw, data, current, menu);
  assert.deepEqual(result.menu.map(action => action.id), menu.map(action => action.id));
  assert.equal(result.requiresReview, true);
  assert.deepEqual(result.lowConfidenceFields.filter(field => field.path.startsWith('operationIds.')).map(field=>({path:field.path,confidence:field.confidence})), [
    { path:'operationIds.0', confidence:0 }, { path:'operationIds.1', confidence:0 }, { path:'operationIds.2', confidence:0 },
  ]);
  assert.equal(result.warnings.filter(warning => warning.includes('was not visible')).length, 3);
});

test('screenshot import rejects layout/color inconsistencies and illegal stats', () => {
  const current = createDefaultBoard('legacy_3');
  const wrongColor = rawFromBoard(current); wrongColor.banners.core.emblems[0].color = 'blue';
  assert.throws(() => validateScreenshotImport(wrongColor, data, current, menu), /color conflicts/);
  const illegalStat = rawFromBoard(current); illegalStat.banners.core.emblems[0].stat = 'Runes';
  assert.throws(() => validateScreenshotImport(illegalStat, data, current, menu), /illegal red stat/);
});

test('screenshot import rejects unknown teams, unknown visible actions, and duplicate visible actions', () => {
  const current = createDefaultBoard('legacy_3');
  const unknownTeam = rawFromBoard(current); unknownTeam.banners.mid.selectedTeam = 'Not A Team';
  assert.throws(() => validateScreenshotImport(unknownTeam, data, current, menu), /unknown mid team/);
  const unknownAction = rawFromBoard(current, { operationIds:['green-stat-all','not-an-action','blue-trait-all'] });
  assert.throws(() => validateScreenshotImport(unknownAction, data, current, menu), /unknown action/);
  const duplicateAction = rawFromBoard(current, { operationIds:['green-stat-all','green-stat-all',null] });
  assert.throws(() => validateScreenshotImport(duplicateAction, data, current, menu), /duplicate offered actions/);
});
