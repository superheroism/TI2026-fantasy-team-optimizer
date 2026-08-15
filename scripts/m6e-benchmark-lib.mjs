import { performance } from 'node:perf_hooks';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { clearTargetSearchOptimizationCaches, getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';
import { getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';
import { makeState, memorySnapshot, quantile } from './m6c-benchmark-lib.mjs';

export const M6E_BASE_SHA='0e287bf38dd3259e21827245c4bd1c0811e48eba';
function key(action){return action.kind==='board_action'?`board:${action.operationId}:${action.banner}`:action.kind;}
function reset(){clearTransitionCache();resetTransitionDiagnostics();clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);if(global.gc)global.gc();}

export function runSearch(state,data,mode){
  reset();const before=memorySnapshot(),started=performance.now();
  const result=recommendNextAction(state,data,true,mode==='exact'?{modeledHorizonOverride:2,engineeringForceExact:true}:{});
  const runtimeMs=performance.now()-started,after=memorySnapshot(),engine=getLastOptimizerEngineDiagnostics(),transition=getTransitionDiagnostics(),target=getTargetDiagnostics(),targetSearch=getTargetSearchDiagnostics();setTargetDiagnosticsEnabled(false);
  return {mode,runtimeMs,selectedKey:key(result.recommendation.action),selectedUtility:result.recommendation.expectedFinalUtility,ranking:result.ranking.map((row,index)=>({rank:index+1,key:key(row.action),utility:row.expectedFinalUtility})),engine,transition,target,targetSearch,memory:{before,after,maxRSS:after.maxRSS,rssDelta:after.rss-before.rss}};
}

export function summarize(pairs){
  const rows=pairs.map(({definition,exact,production})=>{const oracle=new Map(exact.ranking.map(row=>[row.key,row.utility])),oracleTop=exact.ranking[0],chosen=oracle.get(production.selectedKey);if(chosen===undefined)throw new Error(`production chose unknown root ${production.selectedKey}`);const exactWork=definition.objective==='target_probability'?(exact.target.scenarioChecks||0):(exact.engine.terminalScoringCalls||0),prodWork=definition.objective==='target_probability'?(production.target.scenarioChecks||0):(production.engine.terminalScoringCalls||0);return {caseId:definition.id,objective:definition.objective,operationFamily:definition.operationFamily,marginClass:definition.marginClass,agreement:production.selectedKey===oracleTop.key,oracleRegret:Math.max(0,oracleTop.utility-chosen),runtimeMs:production.runtimeMs,exactRuntimeMs:exact.runtimeMs,speedup:exact.runtimeMs/Math.max(production.runtimeMs,1e-9),stage:production.engine.adaptiveRefinement?.finalStage??production.engine.searchMode,exactFallback:production.engine.adaptiveRefinement?.exactFallback??production.engine.searchMode==='expanded_t2_exact_fallback',structuralWorkAvoided:exactWork?1-prodWork/exactWork:0,maxRSSMiB:production.memory.maxRSS/1024};});
  const expected=rows.filter(x=>x.objective==='expected_score'),target=rows.filter(x=>x.objective==='target_probability');
  const stageDistribution=Object.fromEntries(['k2','k4','k6','exact'].map(stage=>[stage,rows.filter(x=>x.stage===stage).length/rows.length]));
  return {cases:rows.length,rootActionAgreement:rows.filter(x=>x.agreement).length/rows.length,maximumExpectedScoreRegret:Math.max(0,...expected.map(x=>x.oracleRegret)),maximumTargetProbabilityRegret:Math.max(0,...target.map(x=>x.oracleRegret)),medianRuntimeMs:quantile(rows.map(x=>x.runtimeMs),.5),medianSpeedup:quantile(rows.map(x=>x.speedup),.5),p90Speedup:quantile(rows.map(x=>x.speedup),.9),medianStructuralWorkAvoided:quantile(rows.map(x=>x.structuralWorkAvoided),.5),exactFallbackRate:rows.filter(x=>x.exactFallback).length/rows.length,stageDistribution,maxRSSMiB:Math.max(...rows.map(x=>x.maxRSSMiB)),rows};
}
export { makeState };
