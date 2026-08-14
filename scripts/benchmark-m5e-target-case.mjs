import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../docs/js/data/actionCatalog.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { ACTION_WIDENING_PRESETS, CONTINUATION_FIDELITY_PRESETS } from '../docs/js/engine/optimizerContinuation.js';
import { clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { getRawScenarioDiagnostics, resetRawScenarioDiagnostics } from '../docs/js/engine/scoring.js';
import { getTargetDiagnostics, resetTargetDiagnostics, setTargetDiagnosticsEnabled } from '../docs/js/engine/targetProbability.js';

const TARGET_SCORE=55_000;
const MENU_IDS=['green-stat-all','red-quality-all','blue-trait-all'];
const [caseId,horizonText,fidelityId='current',wideningId='none']=process.argv.slice(2);
const horizon=Number(horizonText);
if(!caseId||!Number.isInteger(horizon)||horizon<1||!CONTINUATION_FIDELITY_PRESETS[fidelityId]||(wideningId!=='none'&&!ACTION_WIDENING_PRESETS[wideningId])){
  throw new Error('Usage: benchmark-m5e-target-case.mjs <case-id> <horizon> <current|aggressive> <none|wide>');
}
if(!['current','aggressive'].includes(fidelityId)||!['none','wide'].includes(wideningId))throw new Error('M5E only permits current/aggressive fidelity and none/wide widening.');

const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const data=convertStatisticalModel(raw,titles);
const action=id=>{const found=ACTION_BY_ID.get(id);if(!found)throw new Error(`Unknown action ${id}`);return cloneAction(found);};
const actionKey=a=>a.kind!=='board_action'?a.kind:`${a.kind}|${a.operationId}|${a.banner}`;
const memorySnapshot=()=>{const u=process.memoryUsage();return {heapUsed:u.heapUsed,heapTotal:u.heapTotal,rss:u.rss,external:u.external,arrayBuffers:u.arrayBuffers};};

function run(){
  if(global.gc)global.gc();
  clearTransitionCache();resetTransitionDiagnostics();resetRawScenarioDiagnostics();resetTargetDiagnostics();setTargetDiagnosticsEnabled(true);
  const state={
    board:structuredClone(defaultBoard),tokensRemaining:10,menu:MENU_IDS.map(action),menuRerollAvailable:true,
    username:'M5E target 55k',objective:'target_probability',targetScore:TARGET_SCORE,
  };
  const searchOptions={modeledHorizonOverride:horizon};
  if(fidelityId!=='current')searchOptions.experimentalContinuationFidelity=CONTINUATION_FIDELITY_PRESETS[fidelityId];
  if(wideningId!=='none')searchOptions.experimentalActionWidening=ACTION_WIDENING_PRESETS[wideningId];
  const startMemory=memorySnapshot(),maxRssStartKb=process.resourceUsage().maxRSS,started=performance.now();
  const result=recommendNextAction(state,data,true,searchOptions);
  const runtimeMs=performance.now()-started,endMemory=memorySnapshot(),engine=getLastOptimizerEngineDiagnostics();
  const ranking=result.ranking.map((row,rank)=>({
    rank:rank+1,key:actionKey(row.action),action:formatAction(row.action,state),utility:row.expectedFinalUtility,
    expectedScore:row.expectedFinalScore,tokensAfter:row.tokensAfter,
  }));
  const stop=ranking.find(row=>row.key==='stop'),menuReroll=ranking.find(row=>row.key==='menu_reroll');
  const output={
    id:caseId,horizon,fidelityId,wideningId,objective:'target_probability',targetScore:TARGET_SCORE,menuIds:[...MENU_IDS],tokensRemaining:10,
    runtimeMs,recommendation:formatAction(result.recommendation.action,state),recommendationKey:actionKey(result.recommendation.action),
    utility:result.recommendation.expectedFinalUtility,expectedScoreDiagnostic:result.recommendation.expectedFinalScore,
    stopValue:stop?.utility??null,menuRerollValue:menuReroll?.utility??null,ranking,
    memory:{start:startMemory,end:endMemory,heapDelta:endMemory.heapUsed-startMemory.heapUsed,maxRssStartKb,maxRssEndKb:process.resourceUsage().maxRSS},
    engineDiagnostics:engine,transitionDiagnostics:getTransitionDiagnostics(),rawScenarioDiagnostics:getRawScenarioDiagnostics(),targetDiagnostics:getTargetDiagnostics(),
    futureOperationIds:ACTION_CATALOG.map(operation=>operation.id),
  };
  setTargetDiagnosticsEnabled(false);
  return output;
}

process.stdout.write(`${JSON.stringify(run())}\n`);
