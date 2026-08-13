import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';
import { CONTINUATION_FIDELITY_PRESETS, continuationFidelityReport, resolveFreshMenuOutcomeStrata } from '../build/js/engine/continuationFidelity.js';
import { testData } from './test-data.mjs';

function actionKey(action){return action.kind==='board_action'?`${action.kind}|${action.operationId}|${action.banner}`:action.kind;}

test('M5C schedules are explicit, deterministic, and capped by configured fidelity',()=>{
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.current,3,8),8);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,1,8),8);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,2,8),6);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,4,8),4);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,1,8),6);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,2,8),4);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.aggressive,3,8),1);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,1,5),5);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,2,3),3);
});

test('M5C experimental policy is structurally ignored at t<=2',()=>{
  const data=testData({optimizerIterations:4,rankingIterations:4,continuationEntryStrata:3,continuationOutcomeStrata:2,maxLookaheadTokens:2});
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'M5C t2 isolation',objective:'expected_score'};
  const oracle=recommendNextAction(state,data,true,{modeledHorizonOverride:2});
  const experimental=recommendNextAction(state,data,true,{modeledHorizonOverride:2,experimentalContinuationFidelity:CONTINUATION_FIDELITY_PRESETS.aggressive});
  assert.deepEqual(experimental.ranking.map(row=>actionKey(row.action)),oracle.ranking.map(row=>actionKey(row.action)));
  assert.deepEqual(experimental.ranking.map(row=>row.expectedFinalUtility),oracle.ranking.map(row=>row.expectedFinalUtility));
});

test('M5C fidelity reports are serializable and preserve root-entry metadata',()=>{
  const report=continuationFidelityReport(CONTINUATION_FIDELITY_PRESETS.high,8,12);
  assert.deepEqual(JSON.parse(JSON.stringify(report)),{id:'high',description:CONTINUATION_FIDELITY_PRESETS.high.description,freshMenuOutcomeStrataByDepth:[8,6,4],baseFreshMenuOutcomeStrata:8,rootContinuationEntryStrata:12});
});
