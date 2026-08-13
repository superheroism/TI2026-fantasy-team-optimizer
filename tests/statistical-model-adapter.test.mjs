import { readFileSync } from 'node:fs';
import test from 'node:test';import assert from 'node:assert/strict';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
function role(teams,stats){
  const cells={};for(const s of stats){cells[s.k]={};for(const t of teams)cells[s.k][t]={q:[1,2,3],e:42};}
  return {teams,stats,cells};
}
const coreStats=[{k:'cs',l:'Creep Score',c:'red'},{k:'tf',l:'Teamfight Participation',c:'green'},{k:'gpm',l:'GPM',c:'red'}];
const midStats=[...coreStats,{k:'run',l:'Runes Grabbed',c:'blue'}];
const supStats=[{k:'watch',l:'Watchers Taken',c:'blue'},{k:'tf',l:'Teamfight Participation',c:'green'},{k:'wards',l:'Wards Placed',c:'blue'}];
function gcorr(stats){return {stats:stats.map(x=>x.k),m:stats.map((_,i)=>stats.map((__,j)=>i===j?1:.2))};}
const titles=JSON.parse(readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const raw={levels:[10,50,90],roles:{Core:role(['TEAM VISION'],coreStats),Mid:role(['Team Falcons'],midStats),Support:role(['Team Yandex'],supStats)},gcorr:{Core:gcorr(coreStats),Mid:gcorr(midStats),Support:gcorr(supStats)}};
test('adapter labels fixed team-role player units and uses one retained series',()=>{
  const d=convertStatisticalModel(raw,titles);
  assert.equal(d.players.find(p=>p.role==='core')?.name,'Team Vision (Satanic + Noticed)');
  assert.equal(d.simulation.scoring.retainedGamesPerSeries,2);
  assert.equal(d.simulation.scoring.retainedSeries,1);
  assert.equal(d.players.find(p=>p.role==='support')?.effectiveGamesByStat?.Watchers,42);
});
test('adapter maps canonical snake_case stat keys even when display labels change',()=>{
  const weirdCore=[{k:'creep_score',l:'CS',c:'red'},{k:'teamfight_participation',l:'TFP',c:'green'},{k:'gpm',l:'Gold/min',c:'red'}];
  const weirdMid=[...weirdCore,{k:'runes_grabbed',l:'Bottled/taken',c:'blue'}];
  const weirdSupport=[{k:'watchers_taken',l:'Captured objectives',c:'blue'},{k:'teamfight_participation',l:'TFP',c:'green'},{k:'obs_placed',l:'Observers',c:'blue'}];
  const fixture={levels:[10,50,90],roles:{Core:role(['TEAM VISION'],weirdCore),Mid:role(['Team Falcons'],weirdMid),Support:role(['Team Yandex'],weirdSupport)},gcorr:{Core:gcorr(weirdCore),Mid:gcorr(weirdMid),Support:gcorr(weirdSupport)}};
  const d=convertStatisticalModel(fixture,titles);
  const core=d.players.find(p=>p.role==='core');
  const support=d.players.find(p=>p.role==='support');
  assert.ok(core?.statQuantiles['Creep Score']?.length);
  assert.ok(core?.statQuantiles['Teamfight Participation']?.length);
  assert.ok(support?.statQuantiles['Wards Placed']?.length);
});
