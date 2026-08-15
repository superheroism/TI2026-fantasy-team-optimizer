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

function expandedBanner(role){
  const slots=BOARD_LAYOUTS.expanded_5.roles[role];
  const seen=new Map();
  return {
    role,...context,
    emblems:slots.map((slot,index)=>{
      const n=seen.get(slot.color)??0;seen.set(slot.color,n+1);
      const id=encodeEmblemComponents(n,((index%5)+1),index%TRAIT_ORDER.length);
      return decodeBannerState(role,encodeBannerState({role,...context,emblems:slots.map((inner,j)=>({id:`${role}-${j}`,position:j,color:inner.color,stat:LEGAL_STAT_POOLS[inner.color][0],qualityTier:1,trait:'Fractal'}))},'expanded_5'),context,'expanded_5').emblems[index];
    }),
  };
}

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
  const legacyZero=encodeBoardStateIds(0,0,0,'legacy_3');
  const expandedZero=encodeBoardStateIds(0,0,0,'expanded_5');
  assert.notEqual(legacyZero,expandedZero);
});

test('expanded random quality increase selects each of five physical slots uniformly and normalizes',()=>{
  const banner=makeExpandedBanner('core');
  banner.emblems.forEach(e=>e.qualityTier=3);
  const id=encodeBannerState(banner,'expanded_5');
  const op={id:'test-i',label:'Random Quality',kind:'quality_increase'};
  const outcomes=enumerateCompactBannerOperation('core',id,op,true,'expanded_5');
  assert.equal(outcomes.length,10); // five target slots × tiers IV/V
  approx(sumP(outcomes),1);
  for(const outcome of outcomes)approx(outcome.probability,.1);
});

test('expanded random matching uses all repeated purple slots and aggregates to probability one',()=>{
  const banner=makeExpandedBanner('support');
  const id=encodeBannerState(banner,'expanded_5');
  const op={id:'purple-trait-random',label:'Purple Trait',kind:'trait_reroll',color:'purple',scope:'random_matching'};
  const outcomes=enumerateCompactBannerOperation('support',id,op,true,'expanded_5');
  assert.equal(outcomes.length,12); // 3 possible slots × 4 replacement traits
  approx(sumP(outcomes),1);
  for(const outcome of outcomes)approx(outcome.probability,1/12);
});

test('expanded all-color stat reroll respects color pool and five-slot duplicate pressure',()=>{
  const banner=makeExpandedBanner('core');
  const id=encodeBannerState(banner,'expanded_5');
  const op={id:'red-all',label:'Red all',kind:'stat_reroll',color:'red',scope:'all_matching',excludeCurrent:true};
  const outcomes=enumerateCompactBannerOperation('core',id,op,true,'expanded_5');
  assert.ok(outcomes.length>0);
  approx(sumP(outcomes),1);
  for(const outcome of outcomes){
    const decoded=decodeBannerState('core',outcome.banner,context,'expanded_5');
    const reds=decoded.emblems.filter(e=>e.color==='red');
    assert.equal(new Set(reds.map(e=>e.stat)).size,reds.length);
    for(const e of reds)assert.ok(LEGAL_STAT_POOLS.red.includes(e.stat));
  }
});

test('expanded redistribution is unavailable until authoritative five-slot selection semantics exist',()=>{
  const id=encodeBannerState(makeExpandedBanner('mid'),'expanded_5');
  const op={id:'redistribute',label:'Redistribute',kind:'quality_redistribution'};
  assert.deepEqual(enumerateCompactBannerOperation('mid',id,op,true,'expanded_5'),[]);
});

test('transition cache cannot serve a legacy entry to expanded_5',()=>{
  clearTransitionCache();resetTransitionDiagnostics();
  const op={id:'q',label:'Random Quality',kind:'quality_increase'};
  enumerateCompactBannerOperation('core',0,op,true,'legacy_3');
  enumerateCompactBannerOperation('core',0,op,true,'expanded_5');
  const d=getTransitionDiagnostics();
  assert.equal(d.cacheMisses,2);
  assert.equal(d.cacheHits,0);
});
