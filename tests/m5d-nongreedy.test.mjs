import test from 'node:test';
import assert from 'node:assert/strict';
import { createFreshMenuActionWideningRuntime } from '../docs/js/engine/actionWideningRuntime.js';
import { FiniteHorizonValueFunction } from '../docs/js/engine/valueFunction.js';

const operations=['a','b','c','d'];
function transitions(state,operation){
  if(state===0){
    if(operation==='a')return [{nextState:10,probability:1}];
    if(operation==='b')return [{nextState:6,probability:1}];
    return [{nextState:0,probability:1}];
  }
  if(state===6&&operation==='d')return [{nextState:100,probability:1}];
  return [{nextState:state,probability:1}];
}
function fullValueFunction(){
  return new FiniteHorizonValueFunction({
    stateId:state=>state,operationId:operation=>operation,allOperations:operations,menuOperations:menu=>menu,
    terminalUtility:state=>state,
    actionValue:(state,operation,_tokens,_phase,continuation)=>transitions(state,operation).reduce((sum,row)=>sum+row.probability*continuation(row.nextState),0),
    freshMenuExpectedUtility:(_state,_tokens,baseline,values)=>{
      const byId=new Map(values.map(row=>[row.id,row.value]));
      const menus=[['a','b','c'],['a','b','d'],['a','c','d'],['b','c','d']];
      return menus.reduce((sum,menu)=>sum+Math.max(baseline,...menu.map(id=>byId.get(id))),0)/menus.length;
    },
  });
}

test('delayed-upside B loses one-step but wins full two-spend search',()=>{
  const vf=fullValueFunction();
  assert.ok(10>6);
  assert.ok(vf.A(0,'b',2,'current_menu')>vf.A(0,'a',2,'current_menu'));
});

test('widening deepens delayed-upside B inside K and is deterministic outside K',()=>{
  const shallow=new Map([['a',10],['b',6],['c',0],['d',0]]);
  const deep=new Map([['a',10],['b',40],['c',0],['d',0]]);
  const make=cap=>createFreshMenuActionWideningRuntime({
    policy:{id:`k${cap}`,description:'synthetic',deepOperationCapsByDepth:[cap]},modeledHorizon:3,operations,
    stateId:state=>state,operationId:operation=>operation,
    shallowValue:(_state,operation)=>shallow.get(operation),deepValue:(_state,operation)=>deep.get(operation),
  });
  const inside=make(2),insideValues=operations.map(op=>inside.evaluate('state',op,2,'fresh_menu'));
  assert.equal(insideValues[1],40);assert.equal(Math.max(...insideValues),40);
  const outside1=make(1),outside2=make(1);
  const first=operations.map(op=>outside1.evaluate('state',op,2,'fresh_menu'));
  const second=operations.map(op=>outside2.evaluate('state',op,2,'fresh_menu'));
  assert.deepEqual(first,second);assert.equal(first[1],6);assert.equal(Math.max(...first),10);
});
