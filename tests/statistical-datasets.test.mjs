import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_STATISTICAL_DATASET_ID,
  STATISTICAL_DATASET_OPTIONS,
  STATISTICAL_DATASETS,
  convertStatisticalModel,
} from '../docs/js/data/statisticalModel.js';
import { TI2026_MAIN_EVENT_ELIGIBLE_TEAMS, displayTeamName } from '../docs/js/data/ti2026Rosters.js';

const readJson=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const roles=['Core','Mid','Support'];
const runtimeRoles=['core','mid','support'];
const active=[...TI2026_MAIN_EVENT_ELIGIBLE_TEAMS].sort();

test('exactly two correlation datasets are registered and Pre-TI2026 remains the default',()=>{
  assert.equal(DEFAULT_STATISTICAL_DATASET_ID,'pre-ti2026-correlations');
  assert.deepEqual(STATISTICAL_DATASET_OPTIONS.map(x=>[x.id,x.label,x.kind]),[
    ['pre-ti2026-correlations','Pre-TI2026-Correlations','correlations'],
    ['group-stage-correlations','GroupStage-Correlations','correlations'],
  ]);
  assert.equal(Object.keys(STATISTICAL_DATASETS).length,2);
});

test('group-stage artifact is source-neutral and matches the current statistical contract',async()=>{
  const [pre,group]=await Promise.all([
    readJson('../data/ti2026-statistical-model.json'),
    readJson('../data/ti2026-group-stage-statistical-model.json'),
  ]);
  assert.deepEqual(Object.keys(group).sort(),['gcorr','levels','roles']);
  assert.deepEqual(group.levels,pre.levels);
  for(const role of roles){
    assert.deepEqual(Object.keys(group.roles[role]).sort(),['cells','stats','teams']);
    assert.deepEqual(group.roles[role].stats.map(x=>x.k),pre.roles[role].stats.map(x=>x.k));
    assert.deepEqual(group.roles[role].teams.map(displayTeamName).sort(),active);
    assert.equal(group.gcorr[role].stats.length,group.roles[role].stats.length);
    assert.equal(group.gcorr[role].m.length,group.gcorr[role].stats.length);
    for(const row of group.gcorr[role].m)assert.equal(row.length,group.gcorr[role].stats.length);
    for(const stat of group.roles[role].stats){
      for(const team of group.roles[role].teams){
        const cell=group.roles[role].cells[stat.k][team];
        assert.equal(cell.q.length,group.levels.length);
        assert.ok(Number.isFinite(cell.e));
        assert.ok(cell.q.every(Number.isFinite));
        assert.equal('ev' in cell,false);
      }
    }
  }
});

test('production eligibility filters selectable profiles without deleting historical pre-TI2026 observations',async()=>{
  const [pre,titles]=await Promise.all([
    readJson('../data/ti2026-statistical-model.json'),
    readJson('../data/ti2026-title-model.json'),
  ]);
  const baseline=convertStatisticalModel(pre,titles);
  assert.equal(baseline.players.length,48);
  const production=convertStatisticalModel(pre,titles,'pre-ti2026-correlations',true);
  assert.equal(production.historicalPlayers.length,48);
  assert.equal(production.players.length,24);
  assert.ok(production.historicalPlayers.some(p=>p.team==='OG'));
  assert.equal(production.players.some(p=>p.team==='OG'),false);
  for(const role of runtimeRoles){
    assert.deepEqual(production.players.filter(p=>p.role===role).map(p=>displayTeamName(p.team)).sort(),active);
  }
});

test('group-stage model converts through the same adapter and exposes only its active eight teams',async()=>{
  const [group,titles]=await Promise.all([
    readJson('../data/ti2026-group-stage-statistical-model.json'),
    readJson('../data/ti2026-title-model.json'),
  ]);
  const bundle=convertStatisticalModel(group,titles,'group-stage-correlations',true);
  assert.equal(bundle.statisticalDatasetId,'group-stage-correlations');
  assert.equal(bundle.sourceUrl,'./data/ti2026-group-stage-statistical-model.json');
  assert.equal(bundle.historicalPlayers.length,24);
  assert.equal(bundle.players.length,24);
  for(const role of runtimeRoles)assert.deepEqual(bundle.players.filter(p=>p.role===role).map(p=>displayTeamName(p.team)).sort(),active);
  assert.ok(bundle.roleCorrelations.core.stats.length===12);
  assert.ok(bundle.roleCorrelations.mid.stats.length===18);
  assert.ok(bundle.roleCorrelations.support.stats.length===12);
});
