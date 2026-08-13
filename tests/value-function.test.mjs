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
function explicitAction(state,operation,t,continuation,actionTransitions=transitions){
  const outcomes=actionTransitions(state,operation);
  if(!outcomes.length)return -Infinity;
  return outcomes.reduce((sum,outcome)=>sum+outcome.probability*continuation(outcome.nextState,t-1),0);
}
function createExplicitValue({utility=terminal,actionTransitions=transitions}={}){
  const explicitV=(state,t)=>{
    if(t<=0)return utility(state);
    const stop=utility(state);
    const reroll=t>1?explicitV(state,t-1):stop;
    let sum=0;
    for(const menu of ALL_MENUS){
      let best=Math.max(stop,reroll);
      for(const operation of menu)best=Math.max(best,explicitAction(state,operation,t,explicitV,actionTransitions));
      sum+=best;
    }
    return sum/ALL_MENUS.length;
  };
  const explicitQ=(state,menu,t)=>{
    if(t<=0)return utility(state);
    const stop=utility(state);
    let best=t>1?Math.max(stop,explicitV(state,t-1)):stop;
    for(const operation of menu)best=Math.max(best,explicitAction(state,operation,t,explicitV,actionTransitions));
    return best;
  };
  return {explicitV,explicitQ};
}

function createValueFunction({utility=terminal,actionTransitions=transitions}={}){
  return new FiniteHorizonValueFunction({
    stateId:state=>state,
    operationId:operation=>operation,
    allOperations:OPS,
    menuOperations:menu=>menu,
    terminalUtility:utility,
    actionValue:(state,operation,_t,_phase,continuation)=>{
      const outcomes=actionTransitions(state,operation);
      if(!outcomes.length)return -Infinity;
      return outcomes.reduce((sum,outcome)=>sum+outcome.probability*continuation(outcome.nextState),0);
    },
    freshMenuExpectedUtility:(_state,_t,baseline,operationValues)=>
      expectedUniformBestOfThree(operationValues,baseline),
  });
}

for(const t of [0,1,2,3,4]){
  test(`memoized V matches explicit complete tree at t=${t}`,()=>{
    const vf=createValueFunction();
    const {explicitV}=createExplicitValue();
    assert.ok(Math.abs(vf.V(0,t)-explicitV(0,t))<1e-12);
  });
  test(`memoized Q matches explicit complete tree at t=${t}`,()=>{
    const vf=createValueFunction();
    const {explicitQ}=createExplicitValue();
    const menu=['a','b','d'];
    assert.ok(Math.abs(vf.Q(0,menu,t)-explicitQ(0,menu,t))<1e-12);
  });
}

test('deterministic depth-4 transitions match complete explicit enumeration',()=>{
  const actionTransitions=(state,operation)=>[{nextState:state+({a:3,b:1,c:0,d:-2}[operation]??0),probability:1}];
  const vf=createValueFunction({actionTransitions});
  const {explicitV,explicitQ}=createExplicitValue({actionTransitions});
  assert.ok(Math.abs(vf.V(0,4)-explicitV(0,4))<1e-12);
  assert.ok(Math.abs(vf.Q(0,['a','c','d'],4)-explicitQ(0,['a','c','d'],4))<1e-12);
});

test('stop dominates when every action weakens terminal utility',()=>{
  const vf=createValueFunction({
    actionTransitions:(state)=>[{nextState:state-1,probability:1}],
  });
  for(const t of [1,2,3,4])assert.equal(vf.Q(0,['a','b','c'],t),terminal(0));
});

test('board action dominates when a visible action improves the state',()=>{
  const vf=createValueFunction({
    actionTransitions:(state,operation)=>[{nextState:state+(operation==='a'?5:-1),probability:1}],
  });
  assert.equal(vf.Q(0,['a','b','c'],1),15);
});

test('menu reroll and repeated menu rerolls are represented by V recursion',()=>{
  const actionTransitions=(state,operation)=>[{nextState:state+(operation==='d'?10:-5),probability:1}];
  const vf=createValueFunction({actionTransitions});
  const weakMenu=['a','b','c'];
  assert.equal(vf.Q(0,weakMenu,2),vf.V(0,1));
  assert.equal(vf.Q(0,weakMenu,3),vf.V(0,2));
  assert.ok(vf.V(0,2)>=vf.V(0,1));
});

test('ties and unavailable actions preserve exact value semantics',()=>{
  const actionTransitions=(state,operation)=>{
    if(operation==='d')return [];
    if(operation==='a'||operation==='b')return [{nextState:state+2,probability:1}];
    return [{nextState:state,probability:1}];
  };
  const vf=createValueFunction({actionTransitions});
  const {explicitV,explicitQ}=createExplicitValue({actionTransitions});
  for(const t of [1,2,3,4]){
    assert.ok(Math.abs(vf.V(0,t)-explicitV(0,t))<1e-12);
    assert.ok(Math.abs(vf.Q(0,['a','c','d'],t)-explicitQ(0,['a','c','d'],t))<1e-12);
  }
});

test('optional extra tokens cannot reduce V or fixed-menu Q',()=>{
  const vf=createValueFunction();
  const menu=['a','b','d'];
  let previousV=vf.V(0,0),previousQ=vf.Q(0,menu,0);
  for(const t of [1,2,3,4]){
    const nextV=vf.V(0,t),nextQ=vf.Q(0,menu,t);
    assert.ok(nextV+1e-12>=previousV,`V decreased at t=${t}`);
    assert.ok(nextQ+1e-12>=previousQ,`Q decreased at t=${t}`);
    previousV=nextV;previousQ=nextQ;
  }
});

test('transposed stochastic states reuse V/action/terminal memo entries and expose depth diagnostics',()=>{
  const vf=createValueFunction();
  const first=vf.V(0,4);
  const before=vf.getDiagnostics();
  const second=vf.V(0,4);
  const q1=vf.Q(0,['a','b','c'],4);
  const q2=vf.Q(0,['a','b','c'],4);
  const a1=vf.A(0,'a',1,'current_menu');
  const a2=vf.A(0,'a',1,'current_menu');
  const after=vf.getDiagnostics();
  assert.equal(first,second);
  assert.equal(q1,q2);
  assert.equal(a1,a2);
  assert.ok(after.vCacheHits>before.vCacheHits);
  assert.ok(after.qCacheHits>=1);
  assert.ok(after.actionCacheHits>0);
  assert.ok(after.terminalCacheHits>0);
  assert.ok((after.uniqueStatesByDepth['0']??0)>0);
  assert.ok((after.uniqueStatesByDepth['3']??0)>0);
  assert.ok((after.vCallsByDepth['4']??0)>(after.vCacheMissesByDepth['4']??0));
  assert.equal(after.vEntries,after.vCacheMisses);
  assert.equal(after.actionEntries,after.actionCacheMisses);
});
