import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { testData } from './test-data.mjs';

function actionKey(action){
  if(action.kind==='board_action')return `${action.kind}|${action.operationId}|${action.banner}`;
  return action.kind;
}

function assertSameRankedTable(actual,expected){
  assert.deepEqual(actual.ranking.map(row=>actionKey(row.action)),expected.ranking.map(row=>actionKey(row.action)));
  assert.equal(actual.ranking.length,expected.ranking.length);
  for(let index=0;index<actual.ranking.length;index++){
    const row=actual.ranking[index],peer=expected.ranking[index];
    assert.equal(actionKey(row.action),actionKey(peer.action));
    assert.ok(Math.abs(row.expectedFinalUtility-peer.expectedFinalUtility)<1e-9);
    assert.ok(Math.abs(row.expectedFinalScore-peer.expectedFinalScore)<1e-9);
    assert.equal(row.tokensAfter,peer.tokensAfter);
  }
}

for(const objective of ['expected_score','target_probability']){
  for(const tokensRemaining of [1,10]){
    test(`experimental API preserves full t<=2 ranked policy: ${objective}, tokens=${tokensRemaining}`,()=>{
      const data=testData({optimizerIterations:8,rankingIterations:8,continuationEntryStrata:6,continuationOutcomeStrata:4,maxLookaheadTokens:2});
      const state={
        board:structuredClone(defaultBoard),tokensRemaining,menu:structuredClone(defaultMenu),menuRerollAvailable:true,
        username:'M5 t<=2 regression',objective,...(objective==='target_probability'?{targetScore:55_000}:{})
      };
      const production=recommendNextAction(state,data,true);
      const experimental=recommendNextAction(state,data,true,{modeledHorizonOverride:Math.min(tokensRemaining,2)});
      assertSameRankedTable(experimental,production);
    });
  }
}

test('production remains capped at two modeled tokens even when data requests four',()=>{
  const data=testData({optimizerIterations:4,rankingIterations:4,continuationEntryStrata:3,continuationOutcomeStrata:2,maxLookaheadTokens:4});
  const state={
    board:structuredClone(defaultBoard),tokensRemaining:10,menu:structuredClone(defaultMenu),menuRerollAvailable:true,
    username:'M5 production cap',objective:'expected_score',
  };
  recommendNextAction(state,data,true);
  assert.equal(getLastOptimizerEngineDiagnostics().modeledHorizon,2);
});
