import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { BOARD_LAYOUTS } from '../docs/js/domain/rules.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { boardToEngineState } from '../docs/js/engine/stateEncoding.js';
import {
  clearTransitionCache, enumerateEngineOperation, getTransitionDiagnostics, resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';
import {
  getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled,
} from '../docs/js/engine/targetProbability.js';
import { clearTargetSearchOptimizationCaches, getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';

const M6B_BASE_SHA='a3505bbd25d7cac47d115452b924a2f3f8eda4ae';
const layoutId=process.argv[2];
const caseName=process.argv[3];
const horizon=Number(process.argv[4]);
if(!['legacy_3','expanded_5'].includes(layoutId)||!Number.isInteger(horizon)||horizon<1)throw new Error('usage: benchmark-m6b-frontier-case.mjs <legacy_3|expanded_5> <case> <horizon>');
const fixturePath=layoutId==='legacy_3'?'../benchmarks/m6a-layout-legacy-fixtures.json':'../benchmarks/m6a-layout-expanded-fixtures.json';
const fixture=JSON.parse(fs.readFileSync(new URL(fixturePath,import.meta.url),'utf8'));
const definition=fixture.cases.find(x=>x.name===caseName);
if(!definition)throw new Error(`unknown case ${caseName}`);

const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const data=convertStatisticalModel(raw,titles);

function expandedBoard(){
  const board=structuredClone(defaultBoard);board.layoutId='expanded_5';
  const extra={
    core:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Deaths',qualityTier:4,trait:'Unique'}],
    mid:[{stat:'GPM',qualityTier:2,trait:'Friendly'},{stat:'Stuns',qualityTier:4,trait:'Unique'}],
    support:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Smokes Used',qualityTier:4,trait:'Unique'}],
  };
  for(const role of ['core','mid','support']){
    const slots=BOARD_LAYOUTS.expanded_5.roles[role];
    const legacy=board[role].emblems;
    const firstThree=legacy.map((emblem,index)=>({...emblem,id:`${role}-${index}`,position:index,color:slots[index].color}));
    board[role].emblems=[...firstThree,...extra[role].map((e,j)=>({id:`${role}-${j+3}`,position:j+3,color:slots[j+3].color,...e}))];
  }
  return board;
}

const board=layoutId==='legacy_3'?structuredClone(defaultBoard):expandedBoard();
const menu=definition.operationIds.map(id=>cloneAction(ACTION_BY_ID.get(id)));
const state={board,tokensRemaining:10,menu,menuRerollAvailable:true,username:'M6B benchmark',objective:caseName==='target_probability'?'target_probability':'expected_score',...(definition.targetScore?{targetScore:definition.targetScore}:{})};
const roles=['core','mid','support'];

function memory(){const m=process.memoryUsage();return {heapUsed:m.heapUsed,heapTotal:m.heapTotal,rss:m.rss,external:m.external,maxRSS:process.resourceUsage().maxRSS};}
function timed(fn){const t=performance.now(),value=fn();return {value,runtimeMs:performance.now()-t};}
function operationScope(op){return 'scope' in op?op.scope:(op.kind==='quality_increase'||op.kind==='quality_redistribution'?'all_eligible':'unknown');}
function countRecord(record){return Object.values(record??{}).reduce((sum,value)=>sum+Number(value||0),0);}

clearTransitionCache();resetTransitionDiagnostics();
clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);
if(global.gc)global.gc();
const memoryBefore=memory();
const optimizer=timed(()=>recommendNextAction(state,data,true,{modeledHorizonOverride:horizon}));
const memoryAfter=memory();
const result=optimizer.value;
const engineDiagnostics=getLastOptimizerEngineDiagnostics();
const transitionDiagnostics=getTransitionDiagnostics();
const targetDiagnostics=getTargetDiagnostics();
const targetSearchDiagnostics=getTargetSearchDiagnostics();
setTargetDiagnosticsEnabled(false);

const initialEngine=boardToEngineState(board);
const rootActions=[];
for(const operation of menu){
  for(const role of roles){
    clearTransitionCache();resetTransitionDiagnostics();
    const outcomes=enumerateEngineOperation(initialEngine,role,operation,true);
    if(!outcomes.length)continue;
    const diagnostic=getTransitionDiagnostics();
    rootActions.push({
      role,operationId:operation.id,operationFamily:operation.kind,scope:operationScope(operation),
      rawTransitionOutcomes:diagnostic.outcomesBeforeAggregation,
      aggregatedTransitionOutcomes:diagnostic.outcomesAfterAggregation,
      duplicateOutcomesCollapsed:diagnostic.outcomesBeforeAggregation-diagnostic.outcomesAfterAggregation,
      uniqueNextBoardIds:new Set(outcomes.map(x=>String(x.nextState.id))).size,
      uniqueNextBannerIds:new Set(outcomes.map(x=>String(x.nextState[role]))).size,
      transitionGenerationMs:diagnostic.transitionGenerationMs,
    });
  }
}

const frontier={
  rawTransitionOutcomesGenerated:transitionDiagnostics.outcomesBeforeAggregation,
  aggregatedTransitionOutcomes:transitionDiagnostics.outcomesAfterAggregation,
  duplicateTransitionOutcomesCollapsed:transitionDiagnostics.outcomesBeforeAggregation-transitionDiagnostics.outcomesAfterAggregation,
  uniqueContinuationStatesByDepth:engineDiagnostics.valueFunction.uniqueStatesByDepth,
  vCalls:engineDiagnostics.valueFunction.vCalls,
  vCacheHits:engineDiagnostics.valueFunction.vCacheHits,
  vCacheMisses:engineDiagnostics.valueFunction.vCacheMisses,
  qCalls:engineDiagnostics.valueFunction.qCalls,
  qCacheHits:engineDiagnostics.valueFunction.qCacheHits,
  qCacheMisses:engineDiagnostics.valueFunction.qCacheMisses,
  actionCalls:engineDiagnostics.valueFunction.actionCalls,
  actionCacheHits:engineDiagnostics.valueFunction.actionCacheHits,
  actionCacheMisses:engineDiagnostics.valueFunction.actionCacheMisses,
  actionCacheBypasses:engineDiagnostics.valueFunction.actionCacheBypasses,
  actionEvaluations:countRecord(engineDiagnostics.valueFunction.actionEvaluationsByDepth),
  terminalEvaluations:engineDiagnostics.terminalScoringCalls,
  uniqueTerminalBoards:engineDiagnostics.valueFunction.terminalEntries,
  expectedScalarStates:engineDiagnostics.expectedScalarStates,
  targetScalarStates:engineDiagnostics.targetScalarStates,
  transitionDistributionCacheHits:engineDiagnostics.transitionDistributionCacheHits,
  transitionDistributionCacheMisses:engineDiagnostics.transitionDistributionCacheMisses,
  transitionDistributionCacheBypasses:engineDiagnostics.transitionDistributionCacheBypasses,
  transitionGenerationMs:transitionDiagnostics.transitionGenerationMs,
  expectedScoringMs:engineDiagnostics.expectedScoringMs,
  targetScoringMs:engineDiagnostics.targetScoringMs,
  targetCandidatePreparationMs:targetDiagnostics.candidatePreparationMs,
  targetPairSampleBuildMs:targetSearchDiagnostics.pairSampleBuildMs,
  targetSuffixSummaryBuildMs:targetSearchDiagnostics.suffixSummaryBuildMs,
  targetKernelMs:targetDiagnostics.combinatorialSearchMs,
  targetScenarioChecks:targetDiagnostics.scenarioChecks,
  targetSearchCalls:Object.values(targetDiagnostics.searchCallsByTitlePrefix).reduce((sum,value)=>sum+value,0),
  targetPreparedRoleCacheHits:targetDiagnostics.preparedRoleCacheHits,
  targetPreparedRoleCacheMisses:targetDiagnostics.preparedRoleCacheMisses,
  targetPairGroupCacheHits:targetSearchDiagnostics.pairGroupCacheHits,
  targetPairGroupCacheMisses:targetSearchDiagnostics.pairGroupCacheMisses,
  targetPairSampleCacheHits:targetSearchDiagnostics.pairSampleCacheHits,
  targetPairSampleCacheMisses:targetSearchDiagnostics.pairSampleCacheMisses,
  targetPairSampleCacheBuilds:targetSearchDiagnostics.pairSampleCacheBuilds,
  targetPairCacheResets:targetSearchDiagnostics.pairCacheResets,
  targetPairCacheEstimatedBytes:targetSearchDiagnostics.pairCacheEstimatedBytes,
  targetSuffixCacheHits:targetSearchDiagnostics.suffixCacheHits,
  targetSuffixCacheMisses:targetSearchDiagnostics.suffixCacheMisses,
  targetSuffixCacheBuilds:targetSearchDiagnostics.suffixCacheBuilds,
  targetSuffixCacheResets:targetSearchDiagnostics.suffixCacheResets,
  targetSuffixCacheEstimatedBytes:targetSearchDiagnostics.suffixCacheEstimatedBytes,
  uniquePreparedGroups:targetDiagnostics.uniquePreparedGroups,
  uniquePreparedGroupTuples:targetDiagnostics.uniquePreparedGroupTuples,
  reusedPreparedGroupTuples:targetDiagnostics.reusedPreparedGroupTuples,
  uniquePreparedGroupPairs:targetDiagnostics.uniquePreparedGroupPairs,
  reusedPreparedGroupPairs:targetDiagnostics.reusedPreparedGroupPairs,
};

const resultRow={
  m6bBaseSha:M6B_BASE_SHA,layoutId,case:caseName,horizon,objective:state.objective,targetScore:state.targetScore??null,
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  optimizer:{
    runtimeMs:optimizer.runtimeMs,
    recommendation:formatAction(result.recommendation.action,state),
    utility:result.recommendation.expectedFinalUtility,
    score:result.recommendation.expectedFinalScore,
    actionCount:result.ranking.length,
  },
  frontier,rootActions,engineDiagnostics,targetDiagnostics,targetSearchDiagnostics,transitionDiagnostics,
  memory:{before:memoryBefore,after:memoryAfter,heapDelta:memoryAfter.heapUsed-memoryBefore.heapUsed,rssDelta:memoryAfter.rss-memoryBefore.rss},
};
process.stdout.write(`${JSON.stringify(resultRow)}\n`);
