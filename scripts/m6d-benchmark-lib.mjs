import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ACTION_BY_ID } from '../docs/js/data/actionCatalog.js';
import { evaluateBoard } from '../docs/js/engine/scoring.js';
import { evaluateBoardTarget, getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';
import { clearTargetSearchOptimizationCaches, getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';
import { createTerminalSearchRuntime } from '../docs/js/engine/optimizerTerminal.js';
import { createContinuationRuntime } from '../docs/js/engine/optimizerContinuation.js';
import { formatAction } from '../docs/js/engine/optimizer.js';
import { OPTIMIZER_ROLES, weightedQuantile } from '../docs/js/engine/optimizerHelpers.js';
import { clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { makeState, runExact, memorySnapshot, quantile } from './m6c-benchmark-lib.mjs';

export const M6D_BASE_SHA='7757654ff91a4ca7a4f2fb7cad556620efc88140';
export const CANDIDATE_SPEC=JSON.parse(fs.readFileSync(new URL('../benchmarks/m6d-expanded-adaptive-candidates.json',import.meta.url),'utf8'));
export { makeState, runExact };

function actionKey(action){return action.kind==='board_action'?`board:${action.operationId}:${action.banner}`:action.kind;}
function actionFamily(action){if(action.kind!=='board_action')return action.kind;return ACTION_BY_ID.get(action.operationId)?.kind??'unknown';}
function rankRows(rows){return [...rows].sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility||a._order-b._order);}
function serializeRows(rows,state){return rows.map((row,index)=>({rank:index+1,key:actionKey(row.action),action:formatAction(row.action,state),operationFamily:actionFamily(row.action),estimatedUtility:row.expectedFinalUtility,expectedFinalScore:row.expectedFinalScore??null,pImprove:row.pImprove??null,refined:row._refined??null}));}
function thresholdFor(policy,objective,stageIndex){return objective==='target_probability'?policy.targetProbabilityGapThresholds[stageIndex]:policy.expectedScoreGapThresholds[stageIndex];}
function winnerGap(rows){const ranked=rankRows(rows);return Math.max(0,(ranked[0]?.expectedFinalUtility??0)-(ranked[1]?.expectedFinalUtility??ranked[0]?.expectedFinalUtility??0));}

export function runAdaptiveRefinement(state,data,policy){
  clearTransitionCache();resetTransitionDiagnostics();clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);if(global.gc)global.gc();
  const before=memorySnapshot(),started=performance.now();
  const terminal=createTerminalSearchRuntime(state,data),continuation=createContinuationRuntime(state,data,terminal,true);
  const {valueFunction,menuModel}=continuation,initialEngine=terminal.initialEngine;
  const current=state.objective==='target_probability'?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations):evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=state.objective==='target_probability'?(current.targetProbability??0):current.expected;
  terminal.seedCurrent(current);valueFunction.seedTerminalUtility(initialEngine,stopUtility);
  let order=0;
  const fixedRows=[{action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,_order:order++,_refined:true}];
  const screened=[];
  for(const operation of state.menu)for(const role of OPTIMIZER_ROLES){
    const outcomes=continuation.transitionsFor(initialEngine,role,operation);if(!outcomes.length)continue;
    let screenUtility=0,scoreEv=0,pImprove=0,worst=Infinity;const points=[];
    for(const outcome of outcomes){
      const immediateExpected=terminal.expectedScalar(outcome.nextState),immediateUtility=state.objective==='expected_score'?immediateExpected:terminal.targetScalar(outcome.nextState);
      scoreEv+=outcome.probability*immediateExpected;screenUtility+=outcome.probability*immediateUtility;points.push({value:immediateUtility,probability:outcome.probability});if(immediateUtility>stopUtility)pImprove+=outcome.probability;worst=Math.min(worst,immediateExpected);
    }
    screened.push({operation,role,screenUtility,scoreEv,pImprove,worst,points,_order:order++,refined:false,modeled:null});
  }
  const menuValue=valueFunction.V(initialEngine,1);fixedRows.push({action:{kind:'menu_reroll'},expectedFinalUtility:menuValue,expectedFinalScore:current.expected,_order:order++,_refined:true});
  const screenOrder=[...screened].sort((a,b)=>b.screenUtility-a.screenUtility||a._order-b._order);
  const stages=[];let previousWinner=null;let finalStage='screen';let exactFallback=false;
  const materializeRows=()=>[
    ...fixedRows,
    ...screened.map(item=>{const modeled=item.modeled??{value:item.screenUtility,utilityOutcomes:item.points};const points=[...modeled.utilityOutcomes];return {action:{kind:'board_action',operationId:item.operation.id,banner:item.role},expectedFinalUtility:modeled.value,expectedFinalScore:item.scoreEv,pImprove:item.pImprove,downside:Number.isFinite(item.worst)?item.worst-current.expected:undefined,outcomeP10Utility:weightedQuantile(points,.10),outcomeMedianUtility:weightedQuantile(points,.50),outcomeP90Utility:weightedQuantile(points,.90),_order:item._order,_refined:item.refined};})
  ];
  const refineThrough=k=>{for(const item of screenOrder.slice(0,Math.min(k,screenOrder.length))){if(item.refined)continue;item.modeled=continuation.targetedContinuation(initialEngine,item.operation,item.role,2,'current_menu');item.refined=true;}};
  let rows=materializeRows();previousWinner=actionKey(rankRows(rows)[0].action);
  for(let stageIndex=0;stageIndex<policy.stages.length;stageIndex++){
    const k=policy.stages[stageIndex];refineThrough(k);rows=materializeRows();const ranked=rankRows(rows),winner=actionKey(ranked[0].action),gap=winnerGap(rows),threshold=thresholdFor(policy,state.objective,stageIndex),winnerChanged=previousWinner!==null&&winner!==previousWinner,ambiguous=gap<=threshold||(policy.winnerChangeIsAmbiguous&&winnerChanged);
    stages.push({k,winner,gap,threshold,winnerChanged,ambiguous,refinedBoardActions:screened.filter(x=>x.refined).length});finalStage=`k${k}`;previousWinner=winner;
    if(!ambiguous)break;
    if(stageIndex===policy.stages.length-1&&policy.exactFallback){for(const item of screenOrder){if(item.refined)continue;item.modeled=continuation.targetedContinuation(initialEngine,item.operation,item.role,2,'current_menu');item.refined=true;}rows=materializeRows();exactFallback=true;finalStage='exact';const exactRanked=rankRows(rows),exactWinner=actionKey(exactRanked[0].action),exactGap=winnerGap(rows);stages.push({k:'all',winner:exactWinner,gap:exactGap,threshold:null,winnerChanged:exactWinner!==previousWinner,ambiguous:false,refinedBoardActions:screened.length});break;}
    if(!ambiguous)break;
  }
  const ranking=rankRows(rows),runtimeMs=performance.now()-started,after=memorySnapshot();
  const terminalDiagnostics=terminal.diagnostics(),continuationDiagnostics=continuation.diagnostics(),transition=getTransitionDiagnostics(),target=getTargetDiagnostics(),targetSearch=getTargetSearchDiagnostics();setTargetDiagnosticsEnabled(false);
  const engine={modeledHorizon:2,...terminalDiagnostics,...continuationDiagnostics,valueFunction:valueFunction.getDiagnostics(),menuOperator:menuModel.getDiagnostics()};
  return {mode:'adaptive',policy,runtimeMs,selectedKey:actionKey(ranking[0].action),selectedUtility:ranking[0].expectedFinalUtility,rankedRootTable:serializeRows(ranking,state),refinement:{rootBoardActionsScreened:screened.length,rootBoardActionsRefined:screened.filter(x=>x.refined).length,rootBoardActionsSkipped:screened.filter(x=>!x.refined).length,finalStage,exactFallback,stages},engine,transition,target,targetSearch,memory:{before,after,heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss}};
}

export function summarizeCandidate(exactRuns,candidateRuns){
  const paired=[];
  for(const exact of exactRuns){const cand=candidateRuns.find(x=>x.caseId===exact.caseId);if(!cand||exact.status!=='completed'||cand.status!=='completed')continue;const oracle=new Map(exact.result.rankedRootTable.map(r=>[r.key,r]));const chosenExact=oracle.get(cand.result.selectedKey);if(!chosenExact)throw new Error(`candidate selected unknown root ${cand.result.selectedKey}`);const top=exact.result.rankedRootTable[0],runner=exact.result.rankedRootTable[1];const regret=Math.max(0,top.estimatedUtility-chosenExact.estimatedUtility);const exactChecks=exact.result.target.scenarioChecks||0,candChecks=cand.result.target.scenarioChecks||0,exactWork=exact.result.engine.terminalScoringCalls||0,candWork=cand.result.engine.terminalScoringCalls||0;const structuralBase=exact.objective==='target_probability'&&exactChecks>0?exactChecks:exactWork,structuralCand=exact.objective==='target_probability'&&exactChecks>0?candChecks:candWork;paired.push({caseId:exact.caseId,objective:exact.objective,operationFamily:exact.operationFamily,agreement:cand.result.selectedKey===top.key,oracleRegret:regret,runnerUpGap:Math.max(0,top.estimatedUtility-(runner?.estimatedUtility??top.estimatedUtility)),speedup:exact.result.runtimeMs/Math.max(cand.result.runtimeMs,1e-9),structuralWorkAvoided:structuralBase?1-structuralCand/structuralBase:0,exactRuntimeMs:exact.result.runtimeMs,candidateRuntimeMs:cand.result.runtimeMs,finalStage:cand.result.refinement.finalStage,exactFallback:cand.result.refinement.exactFallback});}
  const expected=paired.filter(x=>x.objective==='expected_score'),target=paired.filter(x=>x.objective==='target_probability'),completed=candidateRuns.filter(x=>x.status==='completed').length;
  return {completionRate:exactRuns.length?completed/exactRuns.length:0,rootActionAgreement:paired.length?paired.filter(x=>x.agreement).length/paired.length:0,maximumOracleRegret:paired.length?Math.max(...paired.map(x=>x.oracleRegret)):null,maximumExpectedScoreOracleRegret:expected.length?Math.max(...expected.map(x=>x.oracleRegret)):0,maximumTargetProbabilityOracleRegret:target.length?Math.max(...target.map(x=>x.oracleRegret)):0,medianSpeedup:quantile(paired.map(x=>x.speedup),.5),p90Speedup:quantile(paired.map(x=>x.speedup),.9),medianStructuralWorkAvoided:quantile(paired.map(x=>x.structuralWorkAvoided),.5),exactFallbackRate:paired.length?paired.filter(x=>x.exactFallback).length/paired.length:0,stageRates:Object.fromEntries(['k2','k4','k6','exact'].map(stage=>[stage,paired.length?paired.filter(x=>x.finalStage===stage).length/paired.length:0])),paired};
}
export function marginBin(objective,gap){const bins=CANDIDATE_SPEC.decisionMarginBins[objective];return gap<=bins.closeMax?'close':gap<=bins.mediumMax?'medium':'easy';}
export function stratify(paired){const groups={};for(const row of paired){for(const [axis,value] of [['objective',row.objective],['operationFamily',row.operationFamily],['decisionMargin',marginBin(row.objective,row.runnerUpGap)],['finalStage',row.finalStage]]){const key=`${axis}:${value}`,g=groups[key]??(groups[key]={axis,value,cases:0,agreements:0,regrets:[],speedups:[],fallbacks:0});g.cases++;if(row.agreement)g.agreements++;if(row.exactFallback)g.fallbacks++;g.regrets.push(row.oracleRegret);g.speedups.push(row.speedup);}}return Object.values(groups).map(g=>({axis:g.axis,value:g.value,cases:g.cases,rootActionAgreement:g.cases?g.agreements/g.cases:0,maximumOracleRegret:Math.max(...g.regrets),medianSpeedup:quantile(g.speedups,.5),exactFallbackRate:g.fallbacks/g.cases}));}
export function qualifies(summary){const a=CANDIDATE_SPEC.acceptance;return summary.completionRate>=a.minimumCompletionRate&&summary.rootActionAgreement>=a.minimumRootActionAgreement&&summary.maximumExpectedScoreOracleRegret<=a.maximumExpectedScoreOracleRegret&&summary.maximumTargetProbabilityOracleRegret<=a.maximumTargetProbabilityOracleRegret&&summary.medianSpeedup>=a.minimumMedianSpeedup&&summary.p90Speedup>=a.minimumP90Speedup;}
