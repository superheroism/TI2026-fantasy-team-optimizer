import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { enumerateEngineOperation, clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';
import { ACTION_WIDENING_PRESETS, CONTINUATION_FIDELITY_PRESETS } from '../docs/js/engine/optimizerContinuation.js';
import { getRawScenarioDiagnostics, resetRawScenarioDiagnostics } from '../docs/js/engine/scoring.js';
import { M5C_EXPECTED_FIXTURES } from './m5c-fixtures.mjs';

const [fixtureName,horizonText,fidelityId='current',wideningId='none']=process.argv.slice(2);
const horizon=Number(horizonText),calibrationFixture=M5C_EXPECTED_FIXTURES.find(row=>row.name===fixtureName);
let fixture=calibrationFixture;
if(!fixture){const holdoutPath=new URL('../benchmarks/m5d-holdout-fixtures.json',import.meta.url);const holdouts=fs.existsSync(holdoutPath)?JSON.parse(fs.readFileSync(holdoutPath,'utf8')).fixtures:[];fixture=holdouts.find(row=>row.name===fixtureName);}
if(!fixture||!Number.isInteger(horizon)||horizon<1||!CONTINUATION_FIDELITY_PRESETS[fidelityId]||(wideningId!=='none'&&!ACTION_WIDENING_PRESETS[wideningId]))throw new Error('Usage: benchmark-m5d-case.mjs <fixture> <horizon> <current|aggressive> <none|wide|medium|narrow>');
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const data=convertStatisticalModel(raw,titles);
const action=id=>{const found=ACTION_BY_ID.get(id);if(!found)throw new Error(`Unknown action ${id}`);return cloneAction(found);};
function fixtureBoard(){
  const context=boardAdapterContext(defaultBoard);let engine=boardToEngineState(defaultBoard);
  for(const mutation of fixture.mutations){
    const role=Array.isArray(mutation)?mutation[0]:mutation.role,operationId=Array.isArray(mutation)?mutation[1]:mutation.operationId;
    const outcomes=enumerateEngineOperation(engine,role,action(operationId),true);if(!outcomes.length)throw new Error(`No outcomes for ${fixture.name} ${role}/${operationId}`);
    const index=Array.isArray(mutation)?Math.min(outcomes.length-1,Math.max(0,Math.floor(mutation[2]*outcomes.length))):mutation.outcomeIndex;
    engine=outcomes[index].nextState;
  }
  if(fixture.finalBoardId&&String(engine.id)!==fixture.finalBoardId)throw new Error(`Holdout replay mismatch for ${fixture.name}`);
  return engineStateToBoard(engine,context);
}
function actionKey(a){return a.kind!=='board_action'?a.kind:`${a.kind}|${a.operationId}|${a.banner}`;}
function memorySnapshot(){const u=process.memoryUsage();return {heapUsed:u.heapUsed,heapTotal:u.heapTotal,rss:u.rss,external:u.external};}
function run(){
  if(global.gc)global.gc();clearTransitionCache();resetTransitionDiagnostics();resetRawScenarioDiagnostics();
  const state={board:fixtureBoard(),tokensRemaining:10,menu:fixture.menu.map(action),menuRerollAvailable:true,username:`M5D ${fixture.name}`,objective:'expected_score'};
  const searchOptions={modeledHorizonOverride:horizon};
  if(fidelityId!=='current')searchOptions.experimentalContinuationFidelity=CONTINUATION_FIDELITY_PRESETS[fidelityId];
  if(wideningId!=='none')searchOptions.experimentalActionWidening=ACTION_WIDENING_PRESETS[wideningId];
  const startMemory=memorySnapshot(),maxRssStart=process.resourceUsage().maxRSS,started=performance.now();
  const result=recommendNextAction(state,data,true,searchOptions),runtimeMs=performance.now()-started,endMemory=memorySnapshot(),engine=getLastOptimizerEngineDiagnostics();
  return {fixture:fixture.name,horizon,fidelityId,wideningId,runtimeMs,recommendation:formatAction(result.recommendation.action,state),recommendationKey:actionKey(result.recommendation.action),utility:result.recommendation.expectedFinalUtility,score:result.recommendation.expectedFinalScore,ranking:result.ranking.map((row,rank)=>({rank:rank+1,key:actionKey(row.action),action:formatAction(row.action,state),utility:row.expectedFinalUtility,score:row.expectedFinalScore})),memory:{start:startMemory,end:endMemory,heapDelta:endMemory.heapUsed-startMemory.heapUsed,maxRssStart,maxRssEnd:process.resourceUsage().maxRSS},engineDiagnostics:engine,transitionDiagnostics:getTransitionDiagnostics(),rawScenarioDiagnostics:getRawScenarioDiagnostics()};
}
process.stdout.write(`${JSON.stringify(run())}\n`);
