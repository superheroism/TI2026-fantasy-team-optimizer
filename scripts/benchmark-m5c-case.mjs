import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import { enumerateEngineOperation, clearTransitionCache, getTransitionDiagnostics, resetTransitionDiagnostics } from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';
import { CONTINUATION_FIDELITY_PRESETS, setExperimentalContinuationFidelity } from '../docs/js/engine/optimizerContinuation.js';
import { getRawScenarioDiagnostics, resetRawScenarioDiagnostics } from '../docs/js/engine/scoring.js';
import { M5C_EXPECTED_FIXTURES } from './m5c-fixtures.mjs';
const fixtureName=process.argv[2],horizon=Number(process.argv[3]),fidelityId=process.argv[4]??'current';
const fixture=M5C_EXPECTED_FIXTURES.find(row=>row.name===fixtureName);
if(!fixture||!Number.isInteger(horizon)||horizon<1||!CONTINUATION_FIDELITY_PRESETS[fidelityId]) throw new Error('Usage: benchmark-m5c-case.mjs <fixture> <horizon> <current|high|medium|aggressive>');
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));const data=convertStatisticalModel(raw,titles);
const action=id=>{const found=ACTION_BY_ID.get(id);if(!found)throw new Error(`Unknown action ${id}`);return cloneAction(found);};
function fixtureBoard(){const context=boardAdapterContext(defaultBoard);let engine=boardToEngineState(defaultBoard);for(const [role,operationId,fraction] of fixture.mutations){const outcomes=enumerateEngineOperation(engine,role,action(operationId),true);if(!outcomes.length)throw new Error(`No outcomes for ${fixture.name} mutation ${role}/${operationId}`);const index=Math.min(outcomes.length-1,Math.max(0,Math.floor(fraction*outcomes.length)));engine=outcomes[index].nextState;}return engineStateToBoard(engine,context);}
function actionKey(a){return a.kind!=='board_action'?a.kind:`${a.kind}|${a.operationId}|${a.banner}`;}
function memorySnapshot(){const u=process.memoryUsage();return {heapUsed:u.heapUsed,heapTotal:u.heapTotal,rss:u.rss,external:u.external};}
function run(){if(global.gc)global.gc();clearTransitionCache();resetTransitionDiagnostics();resetRawScenarioDiagnostics();setExperimentalContinuationFidelity(fidelityId==='current'?undefined:{modeledHorizon:horizon,policy:CONTINUATION_FIDELITY_PRESETS[fidelityId]});const state={board:fixtureBoard(),tokensRemaining:10,menu:fixture.menu.map(action),menuRerollAvailable:true,username:`M5C ${fixture.name}`,objective:'expected_score'};const startMemory=memorySnapshot(),maxRssStart=process.resourceUsage().maxRSS,started=performance.now();try{const result=recommendNextAction(state,data,true,{modeledHorizonOverride:horizon});const runtimeMs=performance.now()-started,endMemory=memorySnapshot(),engine=getLastOptimizerEngineDiagnostics();return {fixture:fixture.name,horizon,fidelityId,runtimeMs,recommendation:formatAction(result.recommendation.action,state),recommendationKey:actionKey(result.recommendation.action),utility:result.recommendation.expectedFinalUtility,score:result.recommendation.expectedFinalScore,ranking:result.ranking.map((row,rank)=>({rank:rank+1,key:actionKey(row.action),action:formatAction(row.action,state),utility:row.expectedFinalUtility,score:row.expectedFinalScore})),memory:{start:startMemory,end:endMemory,heapDelta:endMemory.heapUsed-startMemory.heapUsed,maxRssStart,maxRssEnd:process.resourceUsage().maxRSS},engineDiagnostics:engine,transitionDiagnostics:getTransitionDiagnostics(),rawScenarioDiagnostics:getRawScenarioDiagnostics()};}finally{setExperimentalContinuationFidelity(undefined);}}
process.stdout.write(`${JSON.stringify(run())}\n`);
