import assert from 'node:assert/strict';
import test from 'node:test';

import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../docs/js/domain/rules.js';
import {
  LEGACY_BOARD_STATE_COUNT,
  TRAIT_ORDER,
  boardAdapterContext,
  boardToEngineState,
  decodeBannerState,
  decodeVersionedBoardStateId,
  encodeBannerEmblemIds,
  encodeBannerState,
  encodeBoardStateIds,
  encodeEmblemComponents,
  engineStateToBoard,
} from '../docs/js/engine/stateEncoding.js';
import {
  clearTransitionCache,
  enumerateCompactBannerOperation,
  getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';

const ROLES=['core','mid','support'];
const context={selectedTeam:'M6A',expectedSeries:5};
const sumP=xs=>xs.reduce((s,x)=>s+x.probability,0);
const approx=(a,b,tol=1e-12)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b}`);

function makeExpandedBanner(role){
  const slots=BOARD_LAYOUTS.expanded_5.roles[role];
  const seen=new Map();
  return {role,...context,emblems:slots.map((slot,index)=>{
    const statIndex=seen.get(slot.color)??0;seen.set(slot.color,statIndex+1);
    return {id:`${role}-${index}`,position:index,color:slot.color,stat:LEGAL_STAT_POOLS[slot.color][statIndex],qualityTier:(index%5)+1,trait:TRAIT_ORDER[index%TRAIT_ORDER.length]};
  })};
}

function expandedBoard(){return {layoutId:'expanded_5',core:makeExpandedBanner('core'),mid:makeExpandedBanner('mid'),support:makeExpandedBanner('support')};}

test('M6A freezes exact legacy and expanded physical geometry',()=>{
  assert.deepEqual(BOARD_LAYOUTS.legacy_3.roles.core.map(x=>x.color),['red','green','red']);
  assert.deepEqual(BOARD_LAYOUTS.legacy_3.roles.mid.map(x=>x.color),['red','blue','green']);
  assert.deepEqual(BOARD_LAYOUTS.legacy_3.roles.support.map(x=>x.color),['blue','green','blue']);
  assert.deepEqual(BOARD_LAYOUTS.expanded_5.roles.core.map(x=>x.color),['red','green','red','green','red']);
  assert.deepEqual(BOARD_LAYOUTS.expanded_5.roles.mid.map(x=>x.color),['red','purple','green','red','green']);
  assert.deepEqual(BOARD_LAYOUTS.expanded_5.roles.support.map(x=>x.color),['purple','green','purple','green','purple']);
  assert.deepEqual(LEGAL_STAT_POOLS.purple,LEGAL_STAT_POOLS.blue);
});

test('expanded_5 banner and board codecs round-trip with a layout-isolated board namespace',()=>{
  const board=expandedBoard();
  const engine=boardToEngineState(board);
  const [layout,core,mid,support]=decodeVersionedBoardStateId(engine.id);
  assert.equal(layout,'expanded_5');
  assert.ok(engine.id>=LEGACY_BOARD_STATE_COUNT);
  assert.deepEqual([core,mid,support],[engine.core,engine.mid,engine.support]);
  assert.deepEqual(engineStateToBoard(engine,boardAdapterContext(board)),board);
  for(const role of ROLES){
    const id=encodeBannerState(board[role],'expanded_5');
    assert.equal(encodeBannerState(decodeBannerState(role,id,context,'expanded_5'),'expanded_5'),id);
  }
  assert.notEqual(encodeBoardStateIds(0,0,0,'legacy_3'),encodeBoardStateIds(0,0,0,'expanded_5'));
});

test('old unversioned descriptive boards load in the legacy namespace',()=>{
  const legacy={
    core:{role:'core',...context,emblems:[
      {id:'core-0',position:0,color:'red',stat:'Creep Score',qualityTier:3,trait:'Fractal'},
      {id:'core-1',position:1,color:'green',stat:'Teamfight Participation',qualityTier:3,trait:'Unique'},
      {id:'core-2',position:2,color:'red',stat:'GPM',qualityTier:3,trait:'Friendly'}]},
    mid:{role:'mid',...context,emblems:[
      {id:'mid-0',position:0,color:'red',stat:'Deaths',qualityTier:3,trait:'Fractal'},
      {id:'mid-1',position:1,color:'blue',stat:'Runes',qualityTier:3,trait:'Unique'},
      {id:'mid-2',position:2,color:'green',stat:'Stuns',qualityTier:3,trait:'Friendly'}]},
    support:{role:'support',...context,emblems:[
      {id:'support-0',position:0,color:'blue',stat:'Watchers',qualityTier:3,trait:'Fractal'},
      {id:'support-1',position:1,color:'green',stat:'Courier Kills',qualityTier:3,trait:'Unique'},
      {id:'support-2',position:2,color:'blue',stat:'Wards Placed',qualityTier:3,trait:'Friendly'}]},
  };
  const state=boardToEngineState(legacy);
  assert.equal(state.layoutId,'legacy_3');
  assert.equal(decodeVersionedBoardStateId(state.id)[0],'legacy_3');
  assert.equal(engineStateToBoard(state,boardAdapterContext(legacy)).layoutId,undefined);
});

test('expanded random quality increase selects each of five physical slots uniformly and normalizes',()=>{
  const banner=makeExpandedBanner('core');banner.emblems.forEach(e=>e.qualityTier=3);
  const outcomes=enumerateCompactBannerOperation('core',encodeBannerState(banner,'expanded_5'),{id:'test-i',label:'Random Quality',kind:'quality_increase'},true,'expanded_5');
  assert.equal(outcomes.length,10);
  approx(sumP(outcomes),1);
  for(const outcome of outcomes)approx(outcome.probability,.1);
});

test('Tier-V cap waste aggregates correctly on a five-slot random quality increase',()=>{
  const banner=makeExpandedBanner('core');banner.emblems.forEach(e=>e.qualityTier=5);banner.emblems[0].qualityTier=4;
  const before=encodeBannerState(banner,'expanded_5');
  const outcomes=enumerateCompactBannerOperation('core',before,{id:'cap',label:'Random Quality',kind:'quality_increase'},true,'expanded_5');
  approx(sumP(outcomes),1);
  const unchanged=outcomes.find(x=>x.banner===before);
  assert.ok(unchanged);
  approx(unchanged.probability,4/5);
  assert.equal(outcomes.length,2);
});

test('expanded random matching uses all repeated purple slots and aggregates to probability one',()=>{
  const banner=makeExpandedBanner('support');
  const outcomes=enumerateCompactBannerOperation('support',encodeBannerState(banner,'expanded_5'),{id:'purple-trait-random',label:'Purple Trait',kind:'trait_reroll',color:'purple',scope:'random_matching'},true,'expanded_5');
  assert.equal(outcomes.length,12);
  approx(sumP(outcomes),1);
  for(const outcome of outcomes)approx(outcome.probability,1/12);
});

test('random matching naturally handles a two-slot repeated-color subset',()=>{
  const banner=makeExpandedBanner('mid');
  const outcomes=enumerateCompactBannerOperation('mid',encodeBannerState(banner,'expanded_5'),{id:'green-trait-random',label:'Green Trait',kind:'trait_reroll',color:'green',scope:'random_matching'},true,'expanded_5');
  assert.equal(outcomes.length,8);
  approx(sumP(outcomes),1);
  for(const outcome of outcomes)approx(outcome.probability,1/8);
});

test('expanded all-color stat reroll respects color pool and five-slot duplicate pressure',()=>{
  const banner=makeExpandedBanner('core');
  const outcomes=enumerateCompactBannerOperation('core',encodeBannerState(banner,'expanded_5'),{id:'red-all',label:'Red all',kind:'stat_reroll',color:'red',scope:'all_matching',excludeCurrent:true},true,'expanded_5');
  assert.ok(outcomes.length>0);approx(sumP(outcomes),1);
  for(const outcome of outcomes){
    const decoded=decodeBannerState('core',outcome.banner,context,'expanded_5');
    const reds=decoded.emblems.filter(e=>e.color==='red');
    assert.equal(new Set(reds.map(e=>e.stat)).size,reds.length);
    for(const e of reds)assert.ok(LEGAL_STAT_POOLS.red.includes(e.stat));
  }
});

test('an operation with zero physical targets returns no expanded transitions',()=>{
  const banner=makeExpandedBanner('support');
  const outcomes=enumerateCompactBannerOperation('support',encodeBannerState(banner,'expanded_5'),{id:'red-none',label:'Red Trait',kind:'trait_reroll',color:'red',scope:'all_matching'},true,'expanded_5');
  assert.deepEqual(outcomes,[]);
});

test('identical mutable emblem states at different physical slots remain position-distinct',()=>{
  const same=encodeEmblemComponents(0,3,0),other=encodeEmblemComponents(1,3,1),tail=encodeEmblemComponents(2,3,2);
  const slot0Changed=encodeBannerEmblemIds('expanded_5',[other,same,same,same,tail]);
  const slot2Changed=encodeBannerEmblemIds('expanded_5',[same,same,other,same,tail]);
  assert.notEqual(slot0Changed,slot2Changed);
});

test('expanded redistribution is unavailable until authoritative five-slot selection semantics exist',()=>{
  const id=encodeBannerState(makeExpandedBanner('mid'),'expanded_5');
  assert.deepEqual(enumerateCompactBannerOperation('mid',id,{id:'redistribute',label:'Redistribute',kind:'quality_redistribution'},true,'expanded_5'),[]);
});

test('transition cache cannot serve a legacy entry to expanded_5',()=>{
  clearTransitionCache();resetTransitionDiagnostics();
  const op={id:'q',label:'Random Quality',kind:'quality_increase'};
  enumerateCompactBannerOperation('core',0,op,true,'legacy_3');
  enumerateCompactBannerOperation('core',0,op,true,'expanded_5');
  const d=getTransitionDiagnostics();
  assert.equal(d.cacheMisses,2);assert.equal(d.cacheHits,0);
});
