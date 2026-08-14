import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_WIDENING_PRESETS, rankOperationUtilities, resolveDeepOperationCap, selectDeepOperationIds } from '../docs/js/engine/actionWidening.js';
import { createFreshMenuActionWideningRuntime } from '../docs/js/engine/actionWideningRuntime.js';

for(const [id,expected] of [['wide',[12,8,4,4]],['medium',[8,5,3,3]],['narrow',[5,3,2,2]]]){
  test(`${id} resolves frozen depth caps`,()=>{
    assert.deepEqual([1,2,3,8].map(depth=>resolveDeepOperationCap(ACTION_WIDENING_PRESETS[id],depth)),expected);
  });
}

test('ranking is deterministic and excludes illegal values from the deep set',()=>{
  const values=[{id:'z',value:10},{id:'a',value:10},{id:'illegal',value:-Infinity},{id:'b',value:9}];
  assert.deepEqual(rankOperationUtilities(values).map(row=>row.id),['a','z','b','illegal']);
  assert.deepEqual([...selectDeepOperationIds(ACTION_WIDENING_PRESETS.narrow,1,values)].sort(),['a','b','z']);
});

test('fresh-menu widening preserves every operation and uses shallow fallback',()=>{
  const operations=['a','b','c','d'];
  const shallow=new Map([['a',5],['b',4],['c',3],['d',2]]);
  const deep=new Map([['a',50],['b',40],['c',30],['d',20]]);
  const runtime=createFreshMenuActionWideningRuntime({
    policy:{id:'two',description:'test',deepOperationCapsByDepth:[2]},modeledHorizon:3,operations,
    stateId:state=>state,operationId:operation=>operation,
    shallowValue:(_state,operation)=>shallow.get(operation),
    deepValue:(_state,operation)=>deep.get(operation),
  });
  const values=operations.map(operation=>runtime.evaluate('state',operation,2,'fresh_menu'));
  assert.deepEqual(values,[50,40,3,2]);
  const report=runtime.report();
  assert.equal(report.shallowOperationEvaluations,4);
  assert.equal(report.recursivelyDeepenedOperationEvaluations,2);
  assert.equal(report.operationEvaluationsAvoided,2);
  assert.equal(report.wideningAvoidanceRate,.5);
});

test('current-menu evaluation bypasses widening',()=>{
  const runtime=createFreshMenuActionWideningRuntime({
    policy:{id:'one',description:'test',deepOperationCapsByDepth:[1]},modeledHorizon:3,operations:['a','b'],
    stateId:state=>state,operationId:operation=>operation,shallowValue:()=>-100,
    deepValue:(_state,operation)=>operation==='a'?1:2,
  });
  assert.equal(runtime.evaluate('state','b',3,'current_menu'),2);
  assert.equal(runtime.report().freshMenuStatesWidened,0);
});
