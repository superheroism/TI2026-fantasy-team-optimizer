import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { defaultBoard, defaultMenu, convertBoardLayout } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';
import { clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { clearTargetSearchOptimizationCaches, getTargetSearchDiagnostics } from '../docs/js/engine/targetSearch.js';
import { getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';

const [layoutId,objective,tokensText]=process.argv.slice(2),tokens=Number(tokensText);
if(!['legacy_3','expanded_5'].includes(layoutId)||!['expected_score','target_probability'].includes(objective)||![1,2].includes(tokens))throw new Error('Usage: benchmark-m7b-v1-case.mjs <legacy_3|expanded_5> <expected_score|target_probability> <1|2>');
const raw=JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json','utf8'));
const titles=JSON.parse(fs.readFileSync('data/ti2026-title-model.json','utf8'));
const data=convertStatisticalModel(raw,titles);
const board=layoutId==='legacy_3'?structuredClone(defaultBoard):convertBoardLayout(defaultBoard,'expanded_5');
const state={board,tokensRemaining:tokens,menu:structuredClone(defaultMenu),menuRerollAvailable:true,username:'M7B production baseline',objective,...(objective==='target_probability'?{targetScore:55000}:{})};
const actionKey=action=>action.kind==='board_action'?`board:${action.operationId}:${action.banner}`:action.kind;
clearTransitionCache();resetTransitionDiagnostics();clearTargetSearchOptimizationCaches();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);if(global.gc)global.gc();
const before=process.memoryUsage(),started=performance.now(),result=recommendNextAction(state,data,true),wallMs=performance.now()-started,after=process.memoryUsage();
const engine=getLastOptimizerEngineDiagnostics(),transition=getTransitionDiagnostics(),target=getTargetDiagnostics(),targetSearch=getTargetSearchDiagnostics();setTargetDiagnosticsEnabled(false);
console.log(JSON.stringify({
  id:`${layoutId}-${objective}-t${tokens}`,layoutId,objective,tokens,wallMs,
  recommendation:actionKey(result.recommendation.action),objectiveValue:result.recommendation.expectedFinalUtility,currentExpectedScore:result.current.expected,
  searchMode:engine.searchMode,modeledHorizon:engine.modeledHorizon,terminalScoringCalls:engine.terminalScoringCalls,
  adaptiveStage:engine.adaptiveRefinement?.finalStage??null,exactFallback:engine.adaptiveRefinement?.exactFallback??false,fallbackReason:engine.fallbackReason??null,
  transition:{cacheHits:transition.cacheHits??engine.transitionDistributionCacheHits,cacheMisses:transition.cacheMisses??engine.transitionDistributionCacheMisses,cacheEntries:transition.cacheEntries??engine.transitionDistributionEntries},
  target:{scenarioChecks:target.scenarioChecks??0,preparedRoleCacheHits:target.preparedRoleCacheHits??0,preparedRoleCacheMisses:target.preparedRoleCacheMisses??0,targetSearch},
  memory:{rssBefore:before.rss,rssAfter:after.rss,rssDelta:after.rss-before.rss,heapUsedAfter:after.heapUsed}
}));
