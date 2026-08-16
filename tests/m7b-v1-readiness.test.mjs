import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultBoard, defaultMenu, convertBoardLayout } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel, STATISTICAL_MODEL_SCHEMA_ID } from '../docs/js/data/statisticalModel.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { runOptimizerWorkerRequest } from '../docs/js/ui/optimizerWorkerRuntime.js';

const raw=JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json','utf8'));
const titles=JSON.parse(fs.readFileSync('data/ti2026-title-model.json','utf8'));
const data=convertStatisticalModel(raw,titles);

function state(layoutId,objective,tokens,menuRerollAvailable=true){
  const board=layoutId==='legacy_3'?structuredClone(defaultBoard):convertBoardLayout(defaultBoard,'expanded_5');
  return {board,tokensRemaining:tokens,menu:structuredClone(defaultMenu),menuRerollAvailable,username:'M7B readiness',objective,...(objective==='target_probability'?{targetScore:55000}:{})};
}

for(const layoutId of ['legacy_3','expanded_5']){
  for(const objective of ['expected_score','target_probability']){
    test(`${layoutId} ${objective} t=0 is exact terminal stop`,()=>{
      const result=recommendNextAction(state(layoutId,objective,0),data,true),diag=getLastOptimizerEngineDiagnostics();
      assert.equal(diag.searchMode,'exact');
      assert.equal(diag.modeledHorizon,0);
      assert.deepEqual(result.ranking.map(row=>row.action.kind),['stop']);
      assert.equal(result.recommendation.action.kind,'stop');
    });
    test(`${layoutId} ${objective} t=1 is exact`,()=>{
      recommendNextAction(state(layoutId,objective,1),data,true);
      const diag=getLastOptimizerEngineDiagnostics();
      assert.equal(diag.searchMode,'exact');
      assert.equal(diag.modeledHorizon,1);
    });
  }
}

test('legacy_3 production t=2 remains exact for both objectives',()=>{
  for(const objective of ['expected_score','target_probability']){
    recommendNextAction(state('legacy_3',objective,2),data,true);
    const diag=getLastOptimizerEngineDiagnostics();
    assert.equal(diag.searchMode,'exact');
    assert.equal(diag.modeledHorizon,2);
  }
});

test('expanded_5 production t=2 uses the frozen adaptive-tight route for both objectives',()=>{
  for(const objective of ['expected_score','target_probability']){
    recommendNextAction(state('expanded_5',objective,2),data,true);
    const diag=getLastOptimizerEngineDiagnostics();
    assert.match(diag.searchMode,/^expanded_t2_adaptive/);
    assert.equal(diag.modeledHorizon,2);
    assert.equal(diag.adaptiveRefinement?.policyId,'adaptive-tight');
  }
});

test('normal production requests are capped at t=2 even when state/data expose more tokens',()=>{
  const expandedData=structuredClone(data);expandedData.simulation.maxLookaheadTokens=9;
  for(const layoutId of ['legacy_3','expanded_5']){
    const result=recommendNextAction(state(layoutId,'expected_score',9),expandedData,true),diag=getLastOptimizerEngineDiagnostics();
    assert.equal(diag.modeledHorizon,2);
    assert.equal(layoutId==='legacy_3'?diag.searchMode:'expanded',layoutId==='legacy_3'?'exact':'expanded');
    if(layoutId==='expanded_5')assert.match(diag.searchMode,/^expanded_t2_adaptive/);
    assert.ok(result.ranking.every(row=>row.note===undefined||!row.note.includes('3-token')));
  }
});

test('current-menu reroll availability is honored without changing future-menu semantics',()=>{
  for(const [layoutId,tokens] of [['legacy_3',1],['expanded_5',2]]){
    const unavailable=recommendNextAction(state(layoutId,'expected_score',tokens,false),data,true);
    assert.equal(unavailable.ranking.some(row=>row.action.kind==='menu_reroll'),false);
    const available=recommendNextAction(state(layoutId,'expected_score',tokens,true),data,true);
    assert.equal(available.ranking.some(row=>row.action.kind==='menu_reroll'),true);
  }
});

test('worker boundary preserves synchronous production recommendation and routing',()=>{
  for(const layoutId of ['legacy_3','expanded_5']){
    const input=state(layoutId,'expected_score',2);
    const synchronous=recommendNextAction(input,data,true);
    const worker=runOptimizerWorkerRequest(input,data);
    assert.deepEqual(worker.result,synchronous);
    assert.equal(worker.diagnostics.modeledHorizon,2);
  }
});

test('production statistical/title data reject malformed schema inputs clearly',()=>{
  assert.equal(STATISTICAL_MODEL_SCHEMA_ID,'ti2026-statistical-model-v1');
  assert.throws(()=>convertStatisticalModel({},titles),/statistical-model-v1/i);
  const badRaw=structuredClone(raw);badRaw.roles.Core.teams=[];
  assert.throws(()=>convertStatisticalModel(badRaw,titles),/Core teams/i);
  const badTitles=structuredClone(titles);badTitles.schemaVersion=999;
  assert.throws(()=>convertStatisticalModel(raw,badTitles),/Unsupported title model schema version/i);
});
