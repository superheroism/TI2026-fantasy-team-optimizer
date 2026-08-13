import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseTargetRoster } from '../docs/js/engine/targetProbability.js';

function row(id, expected, samples) {
  return {
    playerId: id,
    name: id,
    team: id,
    attachedPlayers: [id],
    expected,
    samples,
  };
}

const fixed = (id, value) => row(id, value, [value, value, value, value]);

test('target objective can prefer lower EV roster with higher target probability', () => {
  const candidates = {
    core: [
      { row: row('EV_CORE', 60, [60, 60, 60, 60]), boostPct: 0 },
      { row: row('TAIL_CORE', 50, [0, 0, 100, 100]), boostPct: 0 },
    ],
    mid: [{ row: fixed('MID', 20), boostPct: 0 }],
    support: [{ row: fixed('SUPPORT', 20), boostPct: 0 }],
  };

  const choice = chooseTargetRoster(candidates, 130, 4);
  assert.ok(choice);
  assert.equal(choice.roster.core[0]?.playerId, 'TAIL_CORE');
  assert.equal(choice.probability, 0.5);
  assert.equal(choice.expected, 90);
  assert.deepEqual(choice.samples, [40, 40, 140, 140]);
});

test('target objective uses expected score only to break equal-probability ties', () => {
  const candidates = {
    core: [
      { row: row('LOW_EV', 40, [0, 0, 80, 80]), boostPct: 0 },
      { row: row('HIGH_EV', 50, [10, 10, 90, 90]), boostPct: 0 },
    ],
    mid: [{ row: fixed('MID', 20), boostPct: 0 }],
    support: [{ row: fixed('SUPPORT', 20), boostPct: 0 }],
  };

  const choice = chooseTargetRoster(candidates, 100, 4);
  assert.ok(choice);
  assert.equal(choice.probability, 0.5);
  assert.equal(choice.roster.core[0]?.playerId, 'HIGH_EV');
  assert.equal(choice.expected, 90);
});
