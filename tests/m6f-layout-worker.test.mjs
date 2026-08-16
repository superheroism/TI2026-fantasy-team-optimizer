import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOARD_LAYOUTS } from '../docs/js/domain/rules.js';
import { createDefaultBoard, convertBoardLayout, defaultBoard, defaultMenu, resolvedLayoutId } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { recommendNextAction } from '../docs/js/engine/optimizer.js';
import { OptimizerRequestCancelledError, OptimizerWorkerClient } from '../docs/js/ui/optimizerClient.js';
import { runOptimizerWorkerRequest } from '../docs/js/ui/optimizerWorkerRuntime.js';
import { makeState } from '../scripts/m6c-benchmark-lib.mjs';

const raw=JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json','utf8'));
const titles=JSON.parse(fs.readFileSync('data/ti2026-title-model.json','utf8'));
const data=convertStatisticalModel(raw,titles);
const corpus=JSON.parse(fs.readFileSync('benchmarks/m6e-expanded-production-integration-fixtures.json','utf8'));
const colors=(board,role)=>board[role].emblems.map(e=>e.color);

test('default UI board resolves to legacy_3 and canonical 3 / 3 / 3 geometry',()=>{
  assert.equal(resolvedLayoutId(defaultBoard),'legacy_3');
  for(const role of ['core','mid','support']){
    assert.equal(defaultBoard[role].emblems.length,3);
    assert.deepEqual(colors(defaultBoard,role),BOARD_LAYOUTS.legacy_3.roles[role].map(slot=>slot.color));
  }
});

test('expanded defaults render canonical 5 / 5 / 5 colors',()=>{
  const board=createDefaultBoard('expanded_5');
  assert.equal(board.layoutId,'expanded_5');
  for(const role of ['core','mid','support']){
    assert.equal(board[role].emblems.length,5);
    assert.deepEqual(colors(board,role),BOARD_LAYOUTS.expanded_5.roles[role].map(slot=>slot.color));
  }
  assert.deepEqual(colors(board,'core'),['red','green','red','green','red']);
  assert.deepEqual(colors(board,'mid'),['red','blue','green','red','green']);
  assert.deepEqual(colors(board,'support'),['blue','green','blue','green','blue']);
});

test('3 → 5 → 3 preserves first three slots and roster context exactly',()=>{
  const legacy=createDefaultBoard('legacy_3');
  legacy.core.emblems[0].qualityTier=5;legacy.mid.emblems[1].trait='Unique';legacy.support.emblems[2].stat='Camps Stacked';
  legacy.core.selectedTeam='XG';legacy.mid.expectedSeries=7;
  const firstThree=Object.fromEntries(['core','mid','support'].map(role=>[role,structuredClone(legacy[role].emblems)]));
  const expanded=convertBoardLayout(legacy,'expanded_5');
  for(const role of ['core','mid','support'])assert.deepEqual(expanded[role].emblems.slice(0,3),firstThree[role]);
  assert.equal(expanded.core.selectedTeam,'XG');assert.equal(expanded.mid.expectedSeries,7);
  const collapsed=convertBoardLayout(expanded,'legacy_3');
  assert.equal(collapsed.layoutId,undefined);
  for(const role of ['core','mid','support'])assert.deepEqual(collapsed[role].emblems,firstThree[role]);
  assert.equal(collapsed.core.selectedTeam,'XG');assert.equal(collapsed.mid.expectedSeries,7);
});

test('layout conversion is board-only and cannot consume tokens or replace menu offers',()=>{
  const state={board:createDefaultBoard('legacy_3'),tokensRemaining:6,menu:structuredClone(defaultMenu)};
  const menuBefore=structuredClone(state.menu);
  state.board=convertBoardLayout(state.board,'expanded_5');
  assert.equal(state.tokensRemaining,6);assert.deepEqual(state.menu,menuBefore);
});

test('reset helper can reset within the currently selected layout',()=>{
  const expanded=convertBoardLayout(createDefaultBoard(),'expanded_5');
  const reset=createDefaultBoard(resolvedLayoutId(expanded));
  assert.equal(reset.layoutId,'expanded_5');
  assert.deepEqual(['core','mid','support'].map(role=>reset[role].emblems.length),[5,5,5]);
});

test('worker runtime recommendation is exactly identical to synchronous engine result',()=>{
  const state={board:structuredClone(defaultBoard),tokensRemaining:1,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'M6F parity',objective:'expected_score'};
  const synchronous=recommendNextAction(state,data,true);
  const worker=runOptimizerWorkerRequest(state,data);
  assert.deepEqual(worker.result,synchronous);
});

test('expanded board through worker runtime reaches M6E adaptive-tight production routing',()=>{
  const definition=corpus.cases.find(x=>x.id==='m6e-tgt-mixed-close');
  const state=makeState(definition,data);state.tokensRemaining=2;
  const worker=runOptimizerWorkerRequest(state,data);
  assert.match(worker.diagnostics.searchMode,/^expanded_t2_adaptive/);
  assert.equal(worker.diagnostics.adaptiveRefinement?.policyId,'adaptive-tight');
  assert.equal(worker.diagnostics.modeledHorizon,2);
});

class FakeWorker {
  onmessage=null;onerror=null;lastMessage=undefined;terminated=false;
  postMessage(message){this.lastMessage=message;}
  terminate(){this.terminated=true;}
  emit(data){this.onmessage?.({data});}
}

test('client cancellation rejects stale work, terminates it, and never accepts its late response',async()=>{
  const workers=[];
  const client=new OptimizerWorkerClient(()=>{const worker=new FakeWorker();workers.push(worker);return worker;});
  const state={board:structuredClone(defaultBoard),tokensRemaining:1,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'stale',objective:'expected_score'};
  const pending=client.optimize(state);const first=workers[0],requestId=first.lastMessage.requestId;
  client.invalidate();
  await assert.rejects(pending,error=>error instanceof OptimizerRequestCancelledError);
  assert.equal(first.terminated,true);
  first.emit({type:'result',requestId,payload:{result:{fake:true},diagnostics:{},optimizerWallMs:1}});
  const secondPromise=client.optimize(state),second=workers[1];
  assert.notEqual(second.lastMessage.requestId,requestId);
  client.invalidate();await assert.rejects(secondPromise,error=>error instanceof OptimizerRequestCancelledError);
});
