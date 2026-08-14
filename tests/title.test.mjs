import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recommendTitle, titlePrefixBoostPct } from '../docs/js/engine/title.js';

const titles=JSON.parse(readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const row=(team,expected)=>({playerId:team,name:team,team,attachedPlayers:[],expected,samples:[expected]});

test('title model preserves team-role prefix values',()=>{
  assert.equal(titlePrefixBoostPct(titles,'core','Team Vision','cerulean'),2.2);
  assert.equal(titlePrefixBoostPct(titles,'mid','Team Falcons','crimson'),3.5);
  assert.equal(titlePrefixBoostPct(titles,'support','LGD Gaming','heroic'),3.7);
});

test('title boost lookup uses canonical names directly and preserves alias fallback',()=>{
  assert.equal(titlePrefixBoostPct(titles,'core','Team Vision','cerulean'),2.2);
  assert.equal(titlePrefixBoostPct(titles,'core','PARIVISION','cerulean'),2.2);
  assert.equal(titlePrefixBoostPct(titles,'mid','XG','royal'),0.2);
});

test('title optimizer maximizes total board gain rather than each role percentage independently',()=>{
  const roster={
    core:[row('Team Vision',30000)],
    mid:[row('Team Falcons',10000)],
    support:[row('LGD Gaming',5000)],
  };
  const r=recommendTitle('Luke',roster,titles);
  // Cerulean: 30,000*2.2% + 10,000*1.1% + 5,000*1.2% = 830.
  assert.equal(r.prefix?.id,'cerulean');
  assert.equal(r.suffix?.id,'clutch');
  assert.equal(Math.round(r.expectedBonus),830);
  assert.deepEqual(r.roleBoostPct,{core:2.2,mid:1.1,support:1.2});
  assert.match(r.display,/Cerulean Luke the Clutch/);
  assert.match(r.suffixExplainer,/game 3/i);
});
