import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { evaluateBanner } from '../docs/js/domain/bannerEvaluator.js';

function banner(){ return structuredClone(defaultBoard.mid); }

test('quality tier determines the base multiplier automatically',()=>{
  const b=banner();
  b.emblems[0].qualityTier=1;b.emblems[1].qualityTier=3;b.emblems[2].qualityTier=5;
  const e=evaluateBanner(b);
  assert.deepEqual(e.map(x=>x.baseMultiplierPct),[110,160,250]);
});

test('Fractal adds 60 percentage points to its owner when all qualities differ',()=>{
  const b=banner();
  b.emblems[0].qualityTier=5;b.emblems[1].qualityTier=3;b.emblems[2].qualityTier=2;b.emblems[0].trait='Fractal';
  assert.equal(evaluateBanner(b)[0].effectiveMultiplierPct,310);
  b.emblems[2].qualityTier=3;
  assert.equal(evaluateBanner(b)[0].effectiveMultiplierPct,250);
});

test('Benevolent adds 20 percentage points to adjacent slots only',()=>{
  const b=banner(); b.emblems[1].trait='Benevolent';
  const e=evaluateBanner(b);
  assert.equal(e[0].effectiveMultiplierPct,180);
  assert.equal(e[1].effectiveMultiplierPct,160);
  assert.equal(e[2].effectiveMultiplierPct,180);
});

test('Vampiric adds 50 to itself and subtracts 10 from adjacent slots',()=>{
  const b=banner(); b.emblems[1].trait='Vampiric';
  const e=evaluateBanner(b);
  assert.equal(e[0].effectiveMultiplierPct,150);
  assert.equal(e[1].effectiveMultiplierPct,210);
  assert.equal(e[2].effectiveMultiplierPct,150);
});

test('Unique is active only when exactly one Unique emblem is present',()=>{
  const b=banner(); b.emblems[0].trait='Unique';
  assert.equal(evaluateBanner(b)[0].effectiveMultiplierPct,190);
  b.emblems[2].trait='Unique';
  const e=evaluateBanner(b);
  assert.equal(e[0].effectiveMultiplierPct,160);
  assert.equal(e[2].effectiveMultiplierPct,160);
});

test('Friendly activates on all Friendly emblems only at three Friendly traits',()=>{
  const b=banner(); b.emblems[0].trait='Friendly';b.emblems[1].trait='Friendly';
  assert.deepEqual(evaluateBanner(b).map(x=>x.effectiveMultiplierPct),[160,160,160]);
  b.emblems[2].trait='Friendly';
  assert.deepEqual(evaluateBanner(b).map(x=>x.effectiveMultiplierPct),[210,210,210]);
});

test('trait effects stack additively on the affected slot',()=>{
  const b=banner();
  b.emblems[0].qualityTier=5;b.emblems[1].qualityTier=3;b.emblems[2].qualityTier=2;
  b.emblems[0].trait='Fractal';b.emblems[1].trait='Benevolent';
  const e=evaluateBanner(b);
  assert.equal(e[0].traitModifierPct,80);
  assert.equal(e[0].effectiveMultiplierPct,330);
});
