import test from 'node:test';
import assert from 'node:assert/strict';
import { convertScriptsBits } from '../docs/js/data/scriptsBits.js';
import { evaluateSelectedBoard } from '../docs/js/engine/scoring.js';

function role(teams,stats){
  const cells={};
  for(const s of stats){cells[s.k]={};for(const t of teams)cells[s.k][t]={q:[100,200,300],e:60};}
  return {teams,stats,cells};
}
const coreStats=[{k:'creep_score',l:'CS',c:'red'},{k:'teamfight_participation',l:'TFP',c:'green'},{k:'gpm',l:'Gold/min',c:'red'}];
const midStats=[{k:'creep_score',l:'CS',c:'red'},{k:'runes_grabbed',l:'Runes',c:'blue'},{k:'teamfight_participation',l:'TFP',c:'green'}];
const supStats=[{k:'watchers_taken',l:'Watchers',c:'blue'},{k:'teamfight_participation',l:'TFP',c:'green'},{k:'obs_placed',l:'Observers',c:'blue'}];
function gcorr(stats){return {stats:stats.map(x=>x.k),m:stats.map((_,i)=>stats.map((__,j)=>i===j?1:.2))};}
const raw={levels:[10,50,90],roles:{Core:role(['TEAM VISION'],coreStats),Mid:role(['Team Falcons'],midStats),Support:role(['Team Yandex'],supStats)},gcorr:{Core:gcorr(coreStats),Mid:gcorr(midStats),Support:gcorr(supStats)}};

const banner=(role,team,stats,colors)=>({role,selectedTeam:team,expectedSeries:5,emblems:stats.map((stat,i)=>({id:`${role}-${i}`,position:i,color:colors[i],stat,qualityTier:3,trait:'Fractal'}))});

test('converted statistical data produces a non-zero selected-setup distribution',()=>{
  const data=convertScriptsBits(raw);
  data.simulation.iterations=200;
  const board={
    core:banner('core','TEAM VISION',['Creep Score','Teamfight Participation','GPM'],['red','green','red']),
    mid:banner('mid','Team Falcons',['Creep Score','Runes','Teamfight Participation'],['red','blue','green']),
    support:banner('support','Team Yandex',['Watchers','Teamfight Participation','Wards Placed'],['blue','green','blue']),
  };
  const result=evaluateSelectedBoard(board,'Test',data);
  assert.equal(result.samples.length,200);
  assert.ok(result.expected>0);
  assert.ok(result.samples.some(x=>x>0));
  assert.ok(result.p90>result.p10);
});
