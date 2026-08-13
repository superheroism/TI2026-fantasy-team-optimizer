import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_BONUS_PCT, CLIENT_SCORING_PIPELINE } from '../docs/js/domain/clientRules.js';

test('client quality bonuses match TI 2026 rules',()=>{
  assert.deepEqual(QUALITY_BONUS_PCT,{1:10,2:30,3:60,4:100,5:150});
});

test('client retains two games and one best series',()=>{
  assert.equal(CLIENT_SCORING_PIPELINE.retainedGamesPerSeries,2);
  assert.equal(CLIENT_SCORING_PIPELINE.retainedSeriesPerPeriod,1);
  assert.equal(CLIENT_SCORING_PIPELINE.rolePlayersAveragedPerGame,true);
});
