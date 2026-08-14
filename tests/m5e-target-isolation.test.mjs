import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { ACTION_WIDENING_PRESETS, CONTINUATION_FIDELITY_PRESETS } from '../docs/js/engine/optimizerContinuation.js';
import { testData } from './test-data.mjs';

const MENU_IDS=['green-stat-all','red-quality-all','blue-trait-all'];
const action=id=>cloneAction(ACTION_BY_ID.get(id));
const key=action=>action.kind!=='board_action'?action.kind:`${action.kind}|${action.operationId}|${action.banner}`;
function table(result){return result.ranking.map(row=>({key:key(row.action),utility:row.expectedFinalUtility,expectedScore:row.expectedFinalScore,tokensAfter:row.tokensAfter}));}

test('M5C aggressive + M5D Wide are structurally ignored for target probability at t=2',()=>{
  const data=testData({optimizerIterations:8,rankingIterations:8,continuationEntryStrata:6,continuationOutcomeStrata:4,maxLookaheadTokens:2});
  const state={
    board:structuredClone(defaultBoard),tokensRemaining:10,menu:MENU_IDS.map(action),menuRerollAvailable:true,
    username:'M5E target isolation',objective:'target_probability',targetScore:55_000,
  };
  const baseline=recommendNextAction(state,data,true,{modeledHorizonOverride:2});
  const baselineDiagnostics=getLastOptimizerEngineDiagnostics();
  const experimental=recommendNextAction(state,data,true,{
    modeledHorizonOverride:2,
    experimentalContinuationFidelity:CONTINUATION_FIDELITY_PRESETS.aggressive,
    experimentalActionWidening:ACTION_WIDENING_PRESETS.wide,
  });
  const experimentalDiagnostics=getLastOptimizerEngineDiagnostics();
  assert.deepEqual(table(experimental),table(baseline));
  assert.equal(key(experimental.recommendation.action),key(baseline.recommendation.action));
  assert.equal(baselineDiagnostics.modeledHorizon,2);assert.equal(experimentalDiagnostics.modeledHorizon,2);
  assert.equal(experimentalDiagnostics.continuationFidelity.id,'current');
  assert.equal(experimentalDiagnostics.actionWidening.enabled,false);
});
