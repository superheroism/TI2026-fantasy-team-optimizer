import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction, formatAction } from '../docs/js/engine/optimizer.js';
import { evaluateSelectedBoard, rankTeamsForRole } from '../docs/js/engine/scoring.js';
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const menus={
  default:['green-stat-all','red-quality-all','blue-trait-all'],
  quality_heavy:['quality-redistribution','red-quality-all','blue-trait-all'],
  stat_heavy:['green-stat-all','red-stat-all','blue-stat-all'],
  global_quality:['quality-increase-one','quality-redistribution','green-quality-all'],
  trait_heavy:['green-trait-all','red-trait-all','blue-trait-all'],
};
function timed(label,fn){const t=performance.now();const value=fn();return {label,ms:performance.now()-t,value};}
const selectedData=convertStatisticalModel(raw,titles);
const selected=timed('selected_20k',()=>evaluateSelectedBoard(structuredClone(defaultBoard),'Benchmark',selectedData));
console.log(`${selected.label.padEnd(20)} ${selected.ms.toFixed(1).padStart(8)} ms  EV ${selected.value.expected.toFixed(1)}`);
const compare=timed('core_comparison_6k',()=>rankTeamsForRole('core',structuredClone(defaultBoard),selectedData,selectedData.simulation.rankingIterations));
console.log(`${compare.label.padEnd(20)} ${compare.ms.toFixed(1).padStart(8)} ms  best ${compare.value[0]?.name??'—'}`);
const switchedBoard=structuredClone(defaultBoard);switchedBoard.core.selectedTeam=compare.value[1]?.team??switchedBoard.core.selectedTeam;
const cachedSwitch=timed('team_switch_cached',()=>rankTeamsForRole('core',switchedBoard,selectedData,selectedData.simulation.rankingIterations));
console.log(`${cachedSwitch.label.padEnd(20)} ${cachedSwitch.ms.toFixed(3).padStart(8)} ms  selected ${switchedBoard.core.selectedTeam}`);
for(const [name,ids] of Object.entries(menus)){
  // Fresh bundle for a cold-cache recommendation benchmark.
  const data=convertStatisticalModel(raw,titles);
  const menu=ids.map(id=>cloneAction(ACTION_BY_ID.get(id)));
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu,menuRerollAvailable:true,username:'Benchmark',objective:'expected_score'};
  const row=timed(`optimizer_${name}`,()=>recommendNextAction(state,data,true));
  console.log(`${row.label.padEnd(20)} ${row.ms.toFixed(1).padStart(8)} ms  ${formatAction(row.value.recommendation.action,state)}`);
}
{
  const data=convertStatisticalModel(raw,titles);
  const menu=menus.default.map(id=>cloneAction(ACTION_BY_ID.get(id)));
  const state={board:structuredClone(defaultBoard),tokensRemaining:10,menu,menuRerollAvailable:true,username:'Benchmark',objective:'target_probability',targetScore:55_000};
  const row=timed('optimizer_target_55k',()=>recommendNextAction(state,data,true));
  console.log(`${row.label.padEnd(20)} ${row.ms.toFixed(1).padStart(8)} ms  ${formatAction(row.value.recommendation.action,state)}`);
}
