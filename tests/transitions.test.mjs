import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { enumerateStatReroll } from '../docs/js/engine/transitions.js';

test('support blue all-matching reroll guarantees changed, non-duplicate final stats',()=>{
  const before=[defaultBoard.support.emblems[0].stat,defaultBoard.support.emblems[2].stat];
  const out=enumerateStatReroll(defaultBoard,'support',{id:'x',label:'x',kind:'stat_reroll',color:'blue',scope:'all_matching',excludeCurrent:false},true);
  assert.equal(out.length,21);
  const p=out.reduce((s,x)=>s+x.probability,0);
  assert.ok(Math.abs(p-1)<1e-9);
  for(const x of out){
    const a=x.board.support.emblems[0].stat;
    const b=x.board.support.emblems[2].stat;
    assert.notEqual(a,b);
    assert.notEqual(a,before[0]);
    assert.notEqual(b,before[1]);
  }
});

test('single stat reroll cannot duplicate another banner stat',()=>{
  const out=enumerateStatReroll(defaultBoard,'support',{id:'x',label:'x',kind:'stat_reroll',color:'blue',scope:'first_matching',excludeCurrent:false},true);
  for(const x of out){
    assert.notEqual(x.board.support.emblems[0].stat,defaultBoard.support.emblems[0].stat);
    assert.notEqual(x.board.support.emblems[0].stat,defaultBoard.support.emblems[2].stat);
  }
});

test('first/last/random matching stat scopes target the correct colored emblem positions', async()=>{
  const { enumerateStatReroll } = await import('../docs/js/engine/transitions.js');
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board=structuredClone(defaultBoard);
  board.core.emblems[0].stat='Creep Score';
  board.core.emblems[2].stat='GPM';
  const first={id:'f',label:'first',kind:'stat_reroll',color:'red',scope:'first_matching',excludeCurrent:true};
  const last={...first,id:'l',scope:'last_matching'};
  const random={...first,id:'r',scope:'random_matching'};
  const f=enumerateStatReroll(board,'core',first,true);
  const l=enumerateStatReroll(board,'core',last,true);
  const r=enumerateStatReroll(board,'core',random,true);
  assert.ok(f.every(o=>o.board.core.emblems[2].stat==='GPM'));
  assert.ok(l.every(o=>o.board.core.emblems[0].stat==='Creep Score'));
  assert.ok(Math.abs(r.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
  assert.ok(r.some(o=>o.board.core.emblems[0].stat!=='Creep Score'));
  assert.ok(r.some(o=>o.board.core.emblems[2].stat!=='GPM'));
});

test('ordinary quality reroll must change and is uniform over the other four tiers', async()=>{
  const { enumerateQualityReroll } = await import('../docs/js/engine/transitions.js');
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board=structuredClone(defaultBoard);
  board.core.emblems[0].qualityTier=3;
  const op={id:'q',label:'q',kind:'quality_reroll',color:'red',scope:'first_matching'};
  const out=enumerateQualityReroll(board,'core',op);
  assert.equal(out.length,4);
  assert.ok(Math.abs(out.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
  assert.deepEqual(new Set(out.map(o=>o.board.core.emblems[0].qualityTier)),new Set([1,2,4,5]));
  assert.ok(out.every(o=>Math.abs(o.probability-.25)<1e-12));
});

test('trait reroll must change and is uniform over the other four traits', async()=>{
  const { enumerateTraitReroll } = await import('../docs/js/engine/transitions.js');
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board=structuredClone(defaultBoard);
  board.support.emblems[0].trait='Fractal';
  const op={id:'t',label:'t',kind:'trait_reroll',color:'blue',scope:'first_matching'};
  const out=enumerateTraitReroll(board,'support',op);
  assert.equal(out.length,4);
  assert.ok(Math.abs(out.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
  assert.deepEqual(new Set(out.map(o=>o.board.support.emblems[0].trait)),new Set(['Friendly','Vampiric','Unique','Benevolent']));
  assert.ok(out.every(o=>Math.abs(o.probability-.25)<1e-12));
});

test('quality increase chooses a random slot then uniformly selects a higher tier', async()=>{
  const { enumerateQualityIncrease } = await import('../docs/js/engine/transitions.js');
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board=structuredClone(defaultBoard);
  board.mid.emblems[0].qualityTier=1;
  board.mid.emblems[1].qualityTier=4;
  board.mid.emblems[2].qualityTier=5;
  const op={id:'inc',label:'inc',kind:'quality_increase'};
  const out=enumerateQualityIncrease(board,'mid',op);
  assert.ok(Math.abs(out.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
  // Tier-I slot has four equally likely higher destinations conditional on its 1/3 target chance.
  const slot0=out.filter(o=>o.board.mid.emblems[0].qualityTier!==1);
  assert.equal(slot0.length,4);
  assert.ok(slot0.every(o=>Math.abs(o.probability-1/12)<1e-12));
  // Selecting capped Tier V is a 1/3 no-change outcome.
  const unchanged=out.find(o=>o.board.mid.emblems.every((e,i)=>e.qualityTier===board.mid.emblems[i].qualityTier));
  assert.ok(unchanged);
  assert.ok(Math.abs(unchanged.probability-1/3)<1e-12);
});

test('quality redistribution assigns one random down slot and directional tier changes respect bounds', async()=>{
  const { enumerateQualityRedistribution } = await import('../docs/js/engine/transitions.js');
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board=structuredClone(defaultBoard);
  board.core.emblems[0].qualityTier=5;
  board.core.emblems[1].qualityTier=1;
  board.core.emblems[2].qualityTier=3;
  const op={id:'redist',label:'redist',kind:'quality_redistribution'};
  const out=enumerateQualityRedistribution(board,'core',op);
  assert.ok(out.length>0);
  assert.ok(Math.abs(out.reduce((s,o)=>s+o.probability,0)-1)<1e-12);
  // Every generated value remains a valid tier.
  assert.ok(out.every(o=>o.board.core.emblems.every(e=>[1,2,3,4,5].includes(e.qualityTier))));
});
