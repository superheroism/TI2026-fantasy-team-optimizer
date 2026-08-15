import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { BOARD_LAYOUTS } from '../docs/js/domain/rules.js';
import { evaluateBoard } from '../docs/js/engine/scoring.js';
import { evaluateBoardTarget, getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';
import { clearTargetSearchOptimizationCaches, getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';
import { createTerminalSearchRuntime } from '../docs/js/engine/optimizerTerminal.js';
import { createContinuationRuntime } from '../docs/js/engine/optimizerContinuation.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { OPTIMIZER_ROLES, weightedQuantile } from '../docs/js/engine/optimizerHelpers.js';
import { clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';

export const M6C_BASE_SHA='42a1a7ec7553e7d6df5f4d3c5576417fcdbbb35a';
export const CANDIDATE_SPEC=JSON.parse(fs.readFileSync(new URL('../benchmarks/m6c-expanded-candidates.json',import.meta.url),'utf8'));

export function expandedBoard(variant='baseline'){
  const board=structuredClone(defaultBoard);board.layoutId='expanded_5';
  const extra={
    core:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Deaths',qualityTier:4,trait:'Unique'}],
    mid:[{stat:'GPM',qualityTier:2,trait:'Friendly'},{stat:'Stuns',qualityTier:4,trait:'Unique'}],
    support:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Smokes Used',qualityTier:4,trait:'Unique'}],
  };
  for(const role of OPTIMIZER_ROLES){
    const slots=BOARD_LAYOUTS.expanded_5.roles[role];
    const firstThree=board[role].emblems.map((emblem,index)=>({...emblem,id:`${role}-${index}`,position:index,color:slots[index].color}));
    board[role].emblems=[...firstThree,...extra[role].map((e,j)=>({id:`${role}-${j+3}`,position:j+3,color:slots[j+3].color,...e}))];
  }
  if(variant==='repeat_permuted'||variant==='repeat_permuted_low'){
    const permutations={core:[4,3,0,1,2],mid:[3,1,4,0,2],support:[4,3,0,1,2]};
    for(const role of OPTIMIZER_ROLES){
      const old=board[role].emblems.map(x=>({...x}));
      board[role].emblems=permutations[role].map((source,index)=>({...old[source],id:`${role}-${index}`,position:index,color:BOARD_LAYOUTS.expanded_5.roles[role][index].color}));
    }
  }
  const tiers=variant==='quality_inverted'?[5,1,2,4,3]:variant==='quality_capped'?[5,5,4,5,4]:variant==='repeat_permuted_low'?[1,2,1,2,3]:null;
  if(tiers)for(const role of OPTIMIZER_ROLES)board[role].emblems=board[role].emblems.map((e,i)=>({...e,qualityTier:tiers[i]}));
  if(!['baseline','repeat_permuted','repeat_permuted_low','quality_inverted','quality_capped'].includes(variant))throw new Error(`unknown M6C board variant ${variant}`);
  return board;
}

export function makeState(definition,data){
  const menu=definition.operationIds.map(id=>{const op=ACTION_BY_ID.get(id);if(!op)throw new Error(`unknown operation ${id}`);return cloneAction(op);});
  return {board:expandedBoard(definition.boardVariant),tokensRemaining:2,menu,menuRerollAvailable:true,username:`M6C ${definition.id}`,objective:definition.objective,...(definition.targetScore?{targetScore:definition.targetScore}:{})};
}

function actionKey(action){return action.kind==='board_action'?`board:${action.operationId}:${action.banner}`:action.kind;}
function actionFamily(action){if(action.kind!=='board_action')return action.kind;return ACTION_BY_ID.get(action.operationId)?.kind??'unknown';}
function rankRows(rows){return rows.sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility||a._order-b._order);}
function serializeRows(rows,state){return rows.map((row,index)=>({rank:index+1,key:actionKey(row.action),action:formatAction(row.action,state),operationFamily:actionFamily(row.action),estimatedUtility:row.expectedFinalUtility,expectedFinalScore:row.expectedFinalScore??null,pImprove:row.pImprove??null,refined:row._refined??null}));}

export function memorySnapshot(){const m=process.memoryUsage();return {heapUsed:m.heapUsed,heapTotal:m.heapTotal,rss:m.rss,external:m.external,maxRSS:process.resourceUsage().maxRSS};}

export function runExact(state,data){
  clearTransitionCache();resetTransitionDiagnostics();clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);if(global.gc)global.gc();
  const before=memorySnapshot(),started=performance.now();
  const result=recommendNextAction(state,data,true,{modeledHorizonOverride:2});
  const runtimeMs=performance.now()-started,after=memorySnapshot();
  const engine=getLastOptimizerEngineDiagnostics(),transition=getTransitionDiagnostics(),target=getTargetDiagnostics(),targetSearch=getTargetSearchDiagnostics();setTargetDiagnosticsEnabled(false);
  const rows=result.ranking.map((row,i)=>({...row,_order:i,_refined:true}));
  return {mode:'exact',runtimeMs,selectedKey:actionKey(result.recommendation.action),selectedUtility:result.recommendation.expectedFinalUtility,rankedRootTable:serializeRows(rows,state),engine,transition,target,targetSearch,memory:{before,after,heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss}};
}

export function runRootRefinement(state,data,policy){
  clearTransitionCache();resetTransitionDiagnostics();clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);if(global.gc)global.gc();
  const before=memorySnapshot(),started=performance.now();
  const terminal=createTerminalSearchRuntime(state,data),continuation=createContinuationRuntime(state,data,terminal,true);
  const {valueFunction,menuModel}=continuation,initialEngine=terminal.initialEngine;
  const current=state.objective==='target_probability'?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations):evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=state.objective==='target_probability'?(current.targetProbability??0):current.expected;
  terminal.seedCurrent(current);valueFunction.seedTerminalUtility(initialEngine,stopUtility);
  let order=0;
  const rows=[{action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,_order:order++,_refined:true}];
  const screened=[];
  for(const operation of state.menu)for(const role of OPTIMIZER_ROLES){
    const outcomes=continuation.transitionsFor(initialEngine,role,operation);if(!outcomes.length)continue;
    let screenUtility=0,scoreEv=0,pImprove=0,worst=Infinity;const points=[];
    for(const outcome of outcomes){
      const immediateExpected=terminal.expectedScalar(outcome.nextState),immediateUtility=state.objective==='expected_score'?immediateExpected:terminal.targetScalar(outcome.nextState);
      scoreEv+=outcome.probability*immediateExpected;screenUtility+=outcome.probability*immediateUtility;points.push({value:immediateUtility,probability:outcome.probability});if(immediateUtility>stopUtility)pImprove+=outcome.probability;worst=Math.min(worst,immediateExpected);
    }
    screened.push({operation,role,screenUtility,scoreEv,pImprove,worst,points,_order:order++});
  }
  const refinedSet=new Set([...screened].sort((a,b)=>b.screenUtility-a.screenUtility||a._order-b._order).slice(0,Math.max(0,Math.floor(policy.maxRefinedBoardActions))).map(x=>`${x.operation.id}|${x.role}`));
  for(const item of screened){
    const refined=refinedSet.has(`${item.operation.id}|${item.role}`);
    const modeled=refined?continuation.targetedContinuation(initialEngine,item.operation,item.role,2,'current_menu'):{value:item.screenUtility,utilityOutcomes:item.points};
    const points=[...modeled.utilityOutcomes],p10=weightedQuantile(points,.10),median=weightedQuantile(points,.50),p90=weightedQuantile(points,.90);
    rows.push({action:{kind:'board_action',operationId:item.operation.id,banner:item.role},expectedFinalUtility:modeled.value,expectedFinalScore:item.scoreEv,pImprove:item.pImprove,downside:Number.isFinite(item.worst)?item.worst-current.expected:undefined,outcomeP10Utility:p10,outcomeMedianUtility:median,outcomeP90Utility:p90,_order:item._order,_refined:refined});
  }
  const menuValue=valueFunction.V(initialEngine,1);
  rows.push({action:{kind:'menu_reroll'},expectedFinalUtility:menuValue,expectedFinalScore:current.expected,_order:order++,_refined:true});
  const ranking=rankRows(rows),runtimeMs=performance.now()-started,after=memorySnapshot();
  const terminalDiagnostics=terminal.diagnostics(),continuationDiagnostics=continuation.diagnostics(),transition=getTransitionDiagnostics(),target=getTargetDiagnostics(),targetSearch=getTargetSearchDiagnostics();setTargetDiagnosticsEnabled(false);
  const engine={modeledHorizon:2,...terminalDiagnostics,...continuationDiagnostics,valueFunction:valueFunction.getDiagnostics(),menuOperator:menuModel.getDiagnostics()};
  return {mode:'candidate',policy,runtimeMs,selectedKey:actionKey(ranking[0].action),selectedUtility:ranking[0].expectedFinalUtility,rankedRootTable:serializeRows(ranking,state),refinement:{rootBoardActionsScreened:screened.length,rootBoardActionsRefined:refinedSet.size,rootBoardActionsSkipped:Math.max(0,screened.length-refinedSet.size),refinedKeys:[...refinedSet].sort()},engine,transition,target,targetSearch,memory:{before,after,heapDelta:after.heapUsed-before.heapUsed,rssDelta:after.rss-before.rss}};
}

export function quantile(values,q){if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);const idx=(sorted.length-1)*q,lo=Math.floor(idx),hi=Math.ceil(idx);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(idx-lo);}
export function summarizeCandidate(exactRuns,candidateRuns){
  const paired=[];
  for(const exact of exactRuns){const cand=candidateRuns.find(x=>x.caseId===exact.caseId);if(!cand||exact.status!=='completed'||cand.status!=='completed')continue;const oracle=new Map(exact.result.rankedRootTable.map(r=>[r.key,r]));const chosenExact=oracle.get(cand.result.selectedKey);if(!chosenExact)throw new Error(`candidate selected unknown root ${cand.result.selectedKey}`);const top=exact.result.rankedRootTable[0],runner=exact.result.rankedRootTable[1];const regret=Math.max(0,top.estimatedUtility-chosenExact.estimatedUtility);const selectedEstimateError=cand.result.selectedUtility-chosenExact.estimatedUtility;const exactWork=exact.result.engine.terminalScoringCalls||0,candWork=cand.result.engine.terminalScoringCalls||0;const exactChecks=exact.result.target.scenarioChecks||0,candChecks=cand.result.target.scenarioChecks||0;const structuralBase=exact.objective==='target_probability'&&exactChecks>0?exactChecks:exactWork,structuralCand=exact.objective==='target_probability'&&exactChecks>0?candChecks:candWork;paired.push({caseId:exact.caseId,objective:exact.objective,operationFamily:exact.operationFamily,agreement:cand.result.selectedKey===top.key,oracleRegret:regret,selectedEstimateError,runnerUpGap:Math.max(0,top.estimatedUtility-(runner?.estimatedUtility??top.estimatedUtility)),speedup:exact.result.runtimeMs/Math.max(cand.result.runtimeMs,1e-9),structuralWorkAvoided:structuralBase?1-structuralCand/structuralBase:0,exactRuntimeMs:exact.result.runtimeMs,candidateRuntimeMs:cand.result.runtimeMs});}
  const completionRate=exactRuns.length?candidateRuns.filter(x=>x.status==='completed').length/exactRuns.length:0,agreements=paired.filter(x=>x.agreement).length,expected=paired.filter(x=>x.objective==='expected_score'),target=paired.filter(x=>x.objective==='target_probability');
  return {completionRate,rootActionAgreement:paired.length?agreements/paired.length:0,meanOracleRegret:paired.length?paired.reduce((s,x)=>s+x.oracleRegret,0)/paired.length:null,medianOracleRegret:quantile(paired.map(x=>x.oracleRegret),.5),p90OracleRegret:quantile(paired.map(x=>x.oracleRegret),.9),maximumOracleRegret:paired.length?Math.max(...paired.map(x=>x.oracleRegret)):null,maximumExpectedScoreOracleRegret:expected.length?Math.max(...expected.map(x=>x.oracleRegret)):0,maximumTargetProbabilityOracleRegret:target.length?Math.max(...target.map(x=>x.oracleRegret)):0,meanAbsoluteSelectedUtilityError:paired.length?paired.reduce((s,x)=>s+Math.abs(x.selectedEstimateError),0)/paired.length:null,medianSpeedup:quantile(paired.map(x=>x.speedup),.5),p90Speedup:quantile(paired.map(x=>x.speedup),.9),medianStructuralWorkAvoided:quantile(paired.map(x=>x.structuralWorkAvoided),.5),paired};
}

export function marginBin(objective,gap){const bins=CANDIDATE_SPEC.decisionMarginBins[objective];return gap<=bins.closeMax?'close':gap<=bins.mediumMax?'medium':'easy';}
export function stratify(paired){const groups={};for(const row of paired){for(const [axis,value] of [['objective',row.objective],['operationFamily',row.operationFamily],['decisionMargin',marginBin(row.objective,row.runnerUpGap)]]){const key=`${axis}:${value}`,g=groups[key]??(groups[key]={axis,value,cases:0,agreements:0,regrets:[],speedups:[]});g.cases++;if(row.agreement)g.agreements++;g.regrets.push(row.oracleRegret);g.speedups.push(row.speedup);}}return Object.values(groups).map(g=>({axis:g.axis,value:g.value,cases:g.cases,rootActionAgreement:g.cases?g.agreements/g.cases:0,meanOracleRegret:g.regrets.reduce((s,x)=>s+x,0)/g.cases,maximumOracleRegret:Math.max(...g.regrets),medianSpeedup:quantile(g.speedups,.5)}));}

export function qualifies(summary){const a=CANDIDATE_SPEC.acceptance;return summary.completionRate>=a.minimumCompletionRate&&summary.rootActionAgreement>=a.minimumRootActionAgreement&&summary.maximumExpectedScoreOracleRegret<=a.maximumExpectedScoreOracleRegret&&summary.maximumTargetProbabilityOracleRegret<=a.maximumTargetProbabilityOracleRegret&&summary.medianSpeedup>=a.minimumMedianSpeedup&&summary.p90Speedup>=a.minimumP90Speedup&&summary.medianStructuralWorkAvoided>=a.minimumMedianStructuralWorkAvoided;}
