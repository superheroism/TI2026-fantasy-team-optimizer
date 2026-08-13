import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { evaluateSelectedBoard } from '../docs/js/engine/scoring.js';
const root=resolve(new URL('..',import.meta.url).pathname);
const modelPath=resolve(root,'data/ti2026-statistical-model.json');
const docsPath=resolve(root,'docs/data/ti2026-statistical-model.json');
const titlePath=resolve(root,'data/ti2026-title-model.json');
const docsTitlePath=resolve(root,'docs/data/ti2026-title-model.json');

function load(path){return JSON.parse(readFileSync(path,'utf8'));}
test('required statistical model is committed and copied into docs/data unchanged',()=>{
  assert.ok(statSync(modelPath).size>250_000,'statistical model should contain the full distribution payload');
  assert.equal(readFileSync(docsPath,'utf8'),readFileSync(modelPath,'utf8'));
  assert.equal(readFileSync(docsTitlePath,'utf8'),readFileSync(titlePath,'utf8')); 
});
test('bundled statistical model has complete role/team/stat/correlation structure',()=>{
  const raw=load(modelPath);
  assert.equal(raw.levels.length,104);
  const expected={Core:[16,12],Mid:[16,18],Support:[16,12]};
  for(const [role,[teamCount,statCount]] of Object.entries(expected)){
    const r=raw.roles[role];
    assert.equal(r.teams.length,teamCount,`${role} team count`);
    assert.equal(r.stats.length,statCount,`${role} stat count`);
    assert.equal(Object.keys(r.cells).length,statCount,`${role} cell-stat count`);
    for(const stat of r.stats){
      const byTeam=r.cells[stat.k];
      assert.ok(byTeam,`${role}/${stat.k} cells`);
      for(const team of r.teams){
        const cell=byTeam[team];
        assert.ok(cell,`${role}/${stat.k}/${team}`);
        assert.equal(cell.q.length,raw.levels.length,`${role}/${stat.k}/${team} quantile length`);
        assert.ok(Number.isFinite(cell.e),`${role}/${stat.k}/${team} effective sample size`);
      }
    }
    const corr=raw.gcorr[role];
    assert.equal(corr.stats.length,statCount,`${role} correlation stat count`);
    assert.equal(corr.m.length,statCount,`${role} correlation row count`);
    for(const row of corr.m)assert.equal(row.length,statCount,`${role} correlation matrix width`);
  }
});
test('actual bundled model produces a nonzero non-degenerate 20k selected-board distribution',()=>{
  const data=convertStatisticalModel(load(modelPath),load(titlePath));
  assert.equal(data.simulation.iterations,20_000);
  const result=evaluateSelectedBoard(structuredClone(defaultBoard),'Test',data,30_000);
  assert.equal(result.samples.length,20_000);
  assert.ok(Number.isFinite(result.expected) && result.expected>0,`expected=${result.expected}`);
  assert.ok(result.p10>0,`p10=${result.p10}`);
  assert.ok(result.p90>result.p10,`p10=${result.p10}, p90=${result.p90}`);
  assert.ok(new Set(result.samples.map(x=>Math.round(x))).size>100,'distribution should have substantial variation');
  assert.ok(result.roster.core[0]?.attachedPlayers.length===2,'Core should resolve to a fixed two-player pair');
  assert.ok(result.roster.mid[0]?.attachedPlayers.length===1,'Mid should resolve to one player');
  assert.ok(result.roster.support[0]?.attachedPlayers.length===2,'Support should resolve to a fixed two-player pair');
});
