import test from 'node:test';
import assert from 'node:assert/strict';

import { testData } from './test-data.mjs';
import { defaultBoard, defaultMenu } from '../docs/js/data/defaultState.js';
import { ACTION_CATALOG, allUniformMenus } from '../docs/js/data/actionCatalog.js';
import { enumerateEngineOperation } from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';
import { evaluateBoard, evaluateBoardExpectedFast } from '../docs/js/engine/scoring.js';
import { evaluateBoardTarget, evaluateBoardTargetProbabilityFast } from '../docs/js/engine/targetProbability.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';

const ROLES=['core','mid','support'];

function stratifiedTransitions(outcomes,maxStrata){
  if(maxStrata<=0||outcomes.length<=maxStrata)return [...outcomes];
  const total=outcomes.reduce((s,x)=>s+x.probability,0);if(total<=0)return [];
  const normalized=outcomes.map(x=>({...x,probability:x.probability/total}));
  const selected=[];let cumulative=0,index=0;
  for(let stratum=0;stratum<maxStrata;stratum++){
    const target=(stratum+0.5)/maxStrata;
    while(index<normalized.length-1&&cumulative+normalized[index].probability<target){cumulative+=normalized[index].probability;index++;}
    selected.push({...normalized[index],probability:1/maxStrata});
  }
  const grouped=new Map();
  for(const x of selected){const prior=grouped.get(x.nextState.id);if(prior)prior.probability+=x.probability;else grouped.set(x.nextState.id,{...x});}
  return [...grouped.values()];
}

function legacyReference(state,data,uniformStatFallback=true){
  const menuSamples=data.menuSamples?.filter(menu=>menu.length===3)??allUniformMenus();
  const horizon=Math.max(1,Math.min(state.tokensRemaining,data.simulation.maxLookaheadTokens??2,2));
  const continuationStrata=Math.max(1,data.simulation.continuationOutcomeStrata??8);
  const continuationEntryStrata=Math.max(1,data.simulation.continuationEntryStrata??12);
  const context=boardAdapterContext(state.board);
  const initialEngine=boardToEngineState(state.board);
  const boardMemo=new Map([[initialEngine.id,state.board]]);
  const boardFor=engine=>{
    const prior=boardMemo.get(engine.id);if(prior)return prior;
    const board=engineStateToBoard(engine,context);boardMemo.set(engine.id,board);return board;
  };
  const scalarMemo=new Map(),targetMemo=new Map(),freshMemo=new Map();
  const expectedScalar=engine=>{
    const prior=scalarMemo.get(engine.id);if(prior!==undefined)return prior;
    const value=evaluateBoardExpectedFast(boardFor(engine),data,data.simulation.optimizerIterations);scalarMemo.set(engine.id,value);return value;
  };
  const targetScalar=engine=>{
    const prior=targetMemo.get(engine.id);if(prior!==undefined)return prior;
    const value=evaluateBoardTargetProbabilityFast(boardFor(engine),data,state.targetScore??0,data.simulation.optimizerIterations);targetMemo.set(engine.id,value);return value;
  };
  const searchUtility=engine=>state.objective==='expected_score'?expectedScalar(engine):targetScalar(engine);
  const terminalActionUtility=(engine,operationId)=>{
    const operation=ACTION_CATALOG.find(entry=>entry.id===operationId);if(!operation)return -Infinity;
    let best=-Infinity;
    for(const role of ROLES){
      const outcomes=stratifiedTransitions(enumerateEngineOperation(engine,role,operation,uniformStatFallback),continuationStrata);
      if(!outcomes.length)continue;
      let ev=0;for(const outcome of outcomes)ev+=outcome.probability*searchUtility(outcome.nextState);
      best=Math.max(best,ev);
    }
    return best;
  };
  const freshMenuUtility=(engine,tokensRemaining)=>{
    const key=`${engine.id}|${tokensRemaining}`;const prior=freshMemo.get(key);if(prior!==undefined)return prior;
    const stop=searchUtility(engine);if(tokensRemaining<=0){freshMemo.set(key,stop);return stop;}
    const values=new Map(ACTION_CATALOG.map(operation=>[operation.id,terminalActionUtility(engine,operation.id)]));
    let sum=0;
    for(const menu of menuSamples){let best=stop;for(const operation of menu)best=Math.max(best,values.get(operation.id)??-Infinity);sum+=best;}
    const result=sum/Math.max(menuSamples.length,1);freshMemo.set(key,result);return result;
  };
  const continuationUtility=(engine,tokensRemaining)=>{
    const immediate=searchUtility(engine);if(horizon<2||tokensRemaining<=0)return immediate;return freshMenuUtility(engine,tokensRemaining);
  };
  const current=state.objective==='target_probability'
    ?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations)
    :evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=state.objective==='target_probability'?(current.targetProbability??0):current.expected;
  if(state.objective==='expected_score')scalarMemo.set(initialEngine.id,current.expected);
  else if(current.targetProbability!==undefined)targetMemo.set(initialEngine.id,current.targetProbability);

  const rows=[{action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,tokensAfter:state.tokensRemaining}];
  if(state.tokensRemaining>0){
    for(const operation of state.menu){
      for(const role of ROLES){
        const outcomes=enumerateEngineOperation(initialEngine,role,operation,uniformStatFallback);if(!outcomes.length)continue;
        let scoreEv=0;
        for(const outcome of outcomes)scoreEv+=outcome.probability*expectedScalar(outcome.nextState);
        const continuationOutcomes=horizon>1&&state.tokensRemaining>1
          ?stratifiedTransitions(outcomes,continuationEntryStrata):[...outcomes];
        let utilityEv=0;
        for(const outcome of continuationOutcomes)utilityEv+=outcome.probability*continuationUtility(outcome.nextState,state.tokensRemaining-1);
        rows.push({action:{kind:'board_action',operationId:operation.id,banner:role},expectedFinalUtility:utilityEv,expectedFinalScore:scoreEv,tokensAfter:state.tokensRemaining-1});
      }
    }
    const nextTokens=state.tokensRemaining-1;
    rows.push(nextTokens===0
      ?{action:{kind:'menu_reroll'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,tokensAfter:0}
      :{action:{kind:'menu_reroll'},expectedFinalUtility:freshMenuUtility(initialEngine,nextTokens),expectedFinalScore:current.expected,tokensAfter:nextTokens});
  }
  rows.sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility);
  return {current,ranking:rows};
}

function key(action){
  if(action.kind==='board_action')return `${action.kind}|${action.operationId}|${action.banner}`;
  return action.kind;
}
function compareResult(actual,reference){
  assert.equal(actual.ranking.length,reference.ranking.length);
  const referenceByKey=new Map(reference.ranking.map(row=>[key(row.action),row]));
  for(const row of actual.ranking){
    const peer=referenceByKey.get(key(row.action));assert.ok(peer,`missing ${key(row.action)}`);
    assert.ok(Math.abs(row.expectedFinalUtility-peer.expectedFinalUtility)<1e-9,`${key(row.action)} utility ${row.expectedFinalUtility} vs ${peer.expectedFinalUtility}`);
    assert.ok(Math.abs(row.expectedFinalScore-peer.expectedFinalScore)<1e-9,`${key(row.action)} score ${row.expectedFinalScore} vs ${peer.expectedFinalScore}`);
    assert.equal(row.tokensAfter,peer.tokensAfter);
  }
  assert.equal(key(actual.recommendation.action),key(reference.ranking[0].action));
  assert.ok(Math.abs(actual.recommendation.expectedFinalUtility-reference.ranking[0].expectedFinalUtility)<1e-9);
}

for(const objective of ['expected_score','target_probability']){
  for(const tokensRemaining of [1,10]){
    test(`M4 V/Q matches pre-M4 two-step optimizer: ${objective}, tokens=${tokensRemaining}`,()=>{
      const data=testData({optimizerIterations:8,rankingIterations:8,continuationEntryStrata:6,continuationOutcomeStrata:4,maxLookaheadTokens:2});
      const state={
        board:structuredClone(defaultBoard),tokensRemaining,menu:structuredClone(defaultMenu),menuRerollAvailable:true,
        username:'M4 equivalence',objective,...(objective==='target_probability'?{targetScore:55_000}:{})
      };
      const reference=legacyReference(state,data,true);
      const actual=recommendNextAction(state,data,true);
      compareResult(actual,reference);
    });
  }
}

test('M4 preserves explicit data.menuSamples continuation semantics',()=>{
  const samples=[
    [ACTION_CATALOG[0],ACTION_CATALOG[1],ACTION_CATALOG[2]],
    [ACTION_CATALOG[4],ACTION_CATALOG[11],ACTION_CATALOG[19]],
    [ACTION_CATALOG[6],ACTION_CATALOG[12],ACTION_CATALOG[18]],
  ].map(menu=>structuredClone(menu));
  const data=testData({optimizerIterations:8,rankingIterations:8,continuationEntryStrata:6,continuationOutcomeStrata:4,maxLookaheadTokens:2});
  data.menuSamples=samples;
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'M4 samples',objective:'expected_score'};
  compareResult(recommendNextAction(state,data,true),legacyReference(state,data,true));
});
