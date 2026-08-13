import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { evaluateSelectedBoard } from '../docs/js/engine/scoring.js';

const raw=JSON.parse(readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
test('committed statistical model is complete',()=>{
  assert.equal(raw.levels.length,104);
  assert.deepEqual(Object.keys(raw.roles).sort(),['Core','Mid','Support']);
  assert.equal(raw.roles.Core.teams.length,16);
  assert.equal(raw.roles.Mid.teams.length,16);
  assert.equal(raw.roles.Support.teams.length,16);
  assert.equal(raw.roles.Core.stats.length,12);
  assert.equal(raw.roles.Mid.stats.length,18);
  assert.equal(raw.roles.Support.stats.length,12);
  for(const role of ['Core','Mid','Support']){
    for(const stat of raw.roles[role].stats){
      for(const team of raw.roles[role].teams){
        assert.equal(raw.roles[role].cells[stat.k][team].q.length,104,`${role}/${stat.k}/${team}`);
      }
    }
    assert.equal(raw.gcorr[role].m.length,raw.gcorr[role].stats.length);
    assert.ok(raw.gcorr[role].m.every(row=>row.length===raw.gcorr[role].stats.length));
  }
});

test('committed title model is complete',()=>{
  assert.equal(titles.prefixes.length,8);
  assert.equal(titles.fixedSuffixId,'clutch');
  for(const role of ['core','mid','support']){
    assert.equal(Object.keys(titles.prefixBoostPctByRoleTeam[role]).length,16);
    for(const row of Object.values(titles.prefixBoostPctByRoleTeam[role])){
      for(const prefix of titles.prefixes)assert.ok(Number.isFinite(row[prefix.id]));
    }
  }
});

test('committed model converts to 48 usable team-role profiles and simulates nonzero scores',()=>{
  const data=convertStatisticalModel(raw,titles);
  assert.equal(data.players.length,48);
  data.simulation.iterations=250;
  const emblem=(role,i,color,stat)=>({id:`${role}-${i}`,position:i,color,stat,qualityTier:3,trait:'Fractal'});
  const board={
    core:{role:'core',selectedTeam:'TEAM VISION',expectedSeries:5,emblems:[emblem('core',0,'red','Creep Score'),emblem('core',1,'green','Teamfight Participation'),emblem('core',2,'red','GPM')]},
    mid:{role:'mid',selectedTeam:'Team Falcons',expectedSeries:5,emblems:[emblem('mid',0,'red','Creep Score'),emblem('mid',1,'blue','Runes'),emblem('mid',2,'green','Teamfight Participation')]},
    support:{role:'support',selectedTeam:'Team Yandex',expectedSeries:5,emblems:[emblem('support',0,'blue','Watchers'),emblem('support',1,'green','Teamfight Participation'),emblem('support',2,'blue','Wards Placed')]},
  };
  const result=evaluateSelectedBoard(board,'Test',data);
  assert.ok(result.expected>0);
  assert.ok(result.p90>result.p10);
});
