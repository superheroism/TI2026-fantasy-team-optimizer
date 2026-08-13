import test from 'node:test';
import assert from 'node:assert/strict';

import { expectedUniformBestOfThree } from '../docs/js/engine/menuModel.js';
import { FiniteHorizonValueFunction } from '../docs/js/engine/valueFunction.js';

const OPS=['a','b','c','d'];
const ALL_MENUS=[
  ['a','b','c'],['a','b','d'],['a','c','d'],['b','c','d'],
];

function transitions(state,operation){
  if(operation==='a')return [{nextState:state+1,probability:1}];
  if(operation==='b')return [{nextState:state+2,probability:.25},{nextState:state-1,probability:.75}];
  if(operation==='c')return [{nextState:state,probability:1}];
  return [{nextState:state-2,probability:.5},{nextState:state+3,probability:.5}];
}
function terminal(state){return 10+state;}
function explicitAction(state,operation,t,continuation){
  return transitions(state,operation).reduce((sum,outcome)=>sum+outcome.probability*continuation(outcome.nextState,t-1),0);
}
function explicitV(state,t){
  if(t<=0)return terminal(state);
  const stop=terminal(state);
  const reroll=t>1?explicitV(state,t-1):stop;
  let sum=0;
  for(const menu of ALL_MENUS){
    let best=Math.max(stop,reroll);
    for(const operation of menu)best=Math.max(best,explicitAction(state,operation,t,explicitV));
    sum+=best;
  }
  return sum/ALL_MENUS.length;
}
function explicitQ(state,menu,t){
  if(t<=0)return terminal(state);
  const stop=terminal(state);
  let best=t>1?Math.max(stop,explicitV(state,t-1)):stop;
  for(const operation of menu)best=Math.max(best,explicitAction(state,operation,t,explicitV));
  return best;
}

function createValueFunction({utility=terminal,actionTransitions=transitions}={}){
  let vf;
  vf=new FiniteHorizonValueFunction({
    stateId:state=>state,
    operationId:operation=>operation,
    allOperations:OPS,
    menuOperations:menu=>menu,
    terminalUtility:utility,
    actionValue:(state,operation,t,_phase,continuation)=>
      actionTransitions(state,operation).reduce((sum,outcome)=>sum+outcome.probability*continuation(outcome.nextState),0),
    freshMenuExpectedUtility:(_state,_t,baseline,operationValues)=>
      expectedUniformBestOfThree(operationValues,baseline),
  });
  return vf;
}

for(const t of [0,1,2]){
  test(`memoized V matches explicit complete tree at t=${t}`,()=>{
    const vf=createValueFunction();
    assert.ok(Math.abs(vf.V(0,t)-explicitV(0,t))<1e-12);
  });
  test(`memoized Q matches explicit complete tree at t=${t}`,()=>{
    const vf=createValueFunction();
    const menu=['a','b','d'];
    assert.ok(Math.abs(vf.Q(0,menu,t)-explicitQ(0,menu,t))<1e-12);
  });
}

test('stop dominates when every action weakens terminal utility',()=>{
  const vf=createValueFunction({
    actionTransitions:(state)=>[{nextState:state-1,probability:1}],
  });
  assert.equal(vf.Q(0,['a','b','c'],1),terminal(0));
});

test('board action dominates when a visible action improves the state',()=>{
  const vf=createValueFunction({
    actionTransitions:(state,operation)=>[{nextState:state+(operation==='a'?5:-1),probability:1}],
  });
  assert.equal(vf.Q(0,['a','b','c'],1),15);
});

test('menu reroll can dominate a weak visible menu at t=2',()=>{
  const vf=createValueFunction({
    actionTransitions:(state,operation)=>[{nextState:state+(operation==='d'?10:-5),probability:1}],
  });
  const current=vf.Q(0,['a','b','c'],2);
  const reroll=vf.V(0,1);
  assert.equal(current,reroll);
  assert.ok(reroll>terminal(0));
});

test('transposed stochastic states reuse V/action/terminal memo entries',()=>{
  const vf=createValueFunction();
  const first=vf.V(0,2);
  const before=vf.getDiagnostics();
  const second=vf.V(0,2);
  const q1=vf.Q(0,['a','b','c'],2);
  const q2=vf.Q(0,['a','b','c'],2);
  const after=vf.getDiagnostics();
  assert.equal(first,second);
  assert.equal(q1,q2);
  assert.ok(after.vCacheHits>before.vCacheHits);
  assert.ok(after.qCacheHits>=1);
  assert.ok(after.actionCacheHits>0);
  assert.ok(after.terminalCacheHits>0);
  assert.ok((after.uniqueStatesByDepth['1']??0)>0);
});
