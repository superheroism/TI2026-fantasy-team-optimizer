import assert from 'node:assert/strict';
import test from 'node:test';

import { defaultBoard } from '../docs/js/data/defaultState.js';
import { bannerMechanicsKey, boardMechanicsKey } from '../docs/js/engine/bannerMechanics.js';

test('banner mechanics key excludes selected team but includes score-relevant mechanics', () => {
  const original = structuredClone(defaultBoard.core);
  const switched = structuredClone(original);
  switched.selectedTeam = `${original.selectedTeam}-other`;

  assert.equal(bannerMechanicsKey(switched), bannerMechanicsKey(original));

  const statChanged = structuredClone(original);
  statChanged.emblems[0].stat = statChanged.emblems[0].stat === 'GPM' ? 'Kills' : 'GPM';
  assert.notEqual(bannerMechanicsKey(statChanged), bannerMechanicsKey(original));

  const qualityChanged = structuredClone(original);
  qualityChanged.emblems[0].qualityTier = qualityChanged.emblems[0].qualityTier === 5 ? 4 : 5;
  assert.notEqual(bannerMechanicsKey(qualityChanged), bannerMechanicsKey(original));

  const traitChanged = structuredClone(original);
  traitChanged.emblems[0].trait = traitChanged.emblems[0].trait === 'Friendly' ? 'Unique' : 'Friendly';
  assert.notEqual(bannerMechanicsKey(traitChanged), bannerMechanicsKey(original));

  const seriesChanged = structuredClone(original);
  seriesChanged.expectedSeries += 1;
  assert.notEqual(bannerMechanicsKey(seriesChanged), bannerMechanicsKey(original));
});

test('board mechanics key ignores free roster selection changes', () => {
  const original = structuredClone(defaultBoard);
  const switched = structuredClone(original);
  switched.core.selectedTeam = `${original.core.selectedTeam}-other`;
  switched.mid.selectedTeam = `${original.mid.selectedTeam}-other`;
  switched.support.selectedTeam = `${original.support.selectedTeam}-other`;

  assert.equal(boardMechanicsKey(switched), boardMechanicsKey(original));
});
