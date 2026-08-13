import test from 'node:test';import assert from 'node:assert/strict';
import { attachedPlayers, teamRoleLabel } from '../docs/js/data/ti2026Rosters.js';

test('Team Vision Core is the fixed Satanic + Noticed pair',()=>{
  assert.deepEqual(attachedPlayers('TEAM VISION','core'),['Satanic','Noticed']);
  assert.equal(teamRoleLabel('TEAM VISION','core'),'Team Vision (Satanic + Noticed)');
});

test('Team Yandex Support is the fixed Saksa + Maladych pair',()=>{
  assert.deepEqual(attachedPlayers('Team Yandex','support'),['Saksa','Maladych']);
});
