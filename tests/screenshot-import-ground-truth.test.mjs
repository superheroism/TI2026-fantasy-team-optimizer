import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDefaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { validateScreenshotImport } from '../docs/js/import/screenshotImport.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/screenshot-expanded5-visible-no-actions.json', import.meta.url), 'utf8'));
const data = { players: [
  { role:'core', team:'Team Vision' },
  { role:'mid', team:'Nigma Galaxy' },
  { role:'support', team:'LGD Gaming' },
] };

test('reference screenshot ground truth imports all 15 visible emblems and preserves missing actions for review', () => {
  const currentBoard = createDefaultBoard('legacy_3');
  const currentMenu = structuredClone(defaultMenu);
  const result = validateScreenshotImport(fixture, data, currentBoard, currentMenu);
  assert.equal(result.board.layoutId, 'expanded_5');
  assert.deepEqual(result.board.core.emblems.map(e => [e.stat,e.qualityTier,e.trait]), [
    ['GPM',4,'Fractal'], ['Teamfight Participation',4,'Vampiric'], ['Creep Score',5,'Vampiric'], ['Roshan Kills',3,'Unique'], ['Tower Kills',2,'Fractal'],
  ]);
  assert.deepEqual(result.board.mid.emblems.map(e => [e.stat,e.qualityTier,e.trait]), [
    ['Tower Kills',5,'Friendly'], ['Runes',5,'Benevolent'], ['Teamfight Participation',5,'Benevolent'], ['Madstone',2,'Friendly'], ['Roshan Kills',5,'Fractal'],
  ]);
  assert.deepEqual(result.board.support.emblems.map(e => [e.stat,e.qualityTier,e.trait]), [
    ['Runes',5,'Friendly'], ['Teamfight Participation',1,'Unique'], ['Camps Stacked',5,'Vampiric'], ['Roshan Kills',2,'Benevolent'], ['Smokes Used',3,'Vampiric'],
  ]);
  assert.equal(result.board.core.selectedTeam, 'Team Vision');
  assert.equal(result.board.mid.selectedTeam, 'Nigma Galaxy');
  assert.equal(result.board.support.selectedTeam, 'LGD Gaming');
  assert.deepEqual(result.menu.map(action => action.id), currentMenu.map(action => action.id));
  assert.deepEqual(result.lowConfidenceFields.filter(field => field.path.startsWith('operationIds.')).map(field => field.confidence), [0,0,0]);
});
