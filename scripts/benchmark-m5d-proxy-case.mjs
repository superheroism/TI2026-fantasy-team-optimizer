import fs from 'node:fs';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../docs/js/data/actionCatalog.js';
import { enumerateEngineOperation } from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';
import { createTerminalSearchRuntime } from '../docs/js/engine/optimizerTerminal.js';
import { createContinuationRuntime, CONTINUATION_FIDELITY_PRESETS } from '../docs/js/engine/optimizerContinuation.js';
import { stratifiedTransitions } from '../docs/js/engine/optimizerHelpers.js';
import { resolveFreshMenuOutcomeStrata } from '../docs/js/engine/continuationFidelity.js';
import { isLegalOperationUtility, rankOperationUtilities } from '../docs/js/engine/actionWidening.js';
import { M5C_EXPECTED_FIXTURES } from './m5c-fixtures.mjs';

const [fixtureName,depthText]=process.argv.slice(2),recursiveDepth=Number(depthText),fixtureIndex=M5C_EXPECTED_FIXTURES.findIndex(row=>row.name===fixtureName),fixture=M5C_EXPECTED_FIXTURES[fixtureIndex];
if(!fixture||![1,2].includes(recursiveDepth))throw new Error('Usage: benchmark-m5d-proxy-case.mjs <calibration-fixture> <1|2>');
const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8')),titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8')),data=convertStatisticalModel(raw,titles);
const action=id=>{const found=ACTION_BY_ID.get(id);if(!found)throw new Error(`Unknown action ${id}`);return cloneAction(found);};
const roles=['core','mid','support'];
function fixtureEngine(){let engine=boardToEngineState(defaultBoard);for(const mutation of fixture.mutations){const [role,operationId,fraction]=mutation,outcomes=enumerateEngineOperation(engine,role,action(operationId),true);if(!outcomes.length)throw new Error(`No outcomes for ${fixture.name} ${role}/${operationId}`);engine=outcomes[Math.min(outcomes.length-1,Math.max(0,Math.floor(fraction*outcomes.length)))].nextState;}return engine;}
function advance(engine,step){const start=(fixtureIndex*7+step*11)%ACTION_CATALOG.length;for(let opOffset=0;opOffset<ACTION_CATALOG.length;opOffset++){const operation=ACTION_CATALOG[(start+opOffset)%ACTION_CATALOG.length];for(let roleOffset=0;roleOffset<roles.length;roleOffset++){const role=roles[(fixtureIndex+step+roleOffset)%roles.length],outcomes=enumerateEngineOperation(engine,role,operation,true);if(!outcomes.length)continue;const outcomeIndex=(fixtureIndex*3+step*5)%outcomes.length;return {nextState:outcomes[outcomeIndex].nextState,mutation:{role,operationId:operation.id,outcomeIndex,outcomeCount:outcomes.length}};}}throw new Error(`Could not advance proxy state ${fixture.name}`);}
let engine=fixtureEngine();const proxyPath=[];for(let step=0;step<recursiveDepth;step++){const moved=advance(engine,step);engine=moved.nextState;proxyPath.push(moved.mutation);}
const context=boardAdapterContext(defaultBoard),board=engineStateToBoard(engine,context),tokensRemaining=3-recursiveDepth;
const state={board,tokensRemaining:10,menu:fixture.menu.map(action),menuRerollAvailable:true,username:`M5D proxy ${fixture.name}`,objective:'expected_score'};
const terminal=createTerminalSearchRuntime(state,data),continuation=createContinuationRuntime(state,data,terminal,true,{modeledHorizon:3,policy:CONTINUATION_FIDELITY_PRESETS.current});
const configuredStrata=Math.max(1,data.simulation.continuationOutcomeStrata??8),strata=resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.current,recursiveDepth,configuredStrata);
const shallowValue=operation=>{let best=-Infinity;for(const role of roles){const exact=enumerateEngineOperation(engine,role,operation,true);if(!exact.length)continue;const modeled=stratifiedTransitions(exact,strata);let value=0;for(const outcome of modeled)value+=outcome.probability*terminal.searchUtility(outcome.nextState);best=Math.max(best,value);}return best;};
const deepValue=operation=>{let best=-Infinity;for(const role of roles)best=Math.max(best,continuation.targetedContinuation(engine,operation,role,tokensRemaining,'fresh_menu').value);return best;};
const shallow=rankOperationUtilities(ACTION_CATALOG.map(operation=>({id:operation.id,value:shallowValue(operation)}))).filter(row=>isLegalOperationUtility(row.value));
const full=rankOperationUtilities(ACTION_CATALOG.map(operation=>({id:operation.id,value:deepValue(operation)}))).filter(row=>isLegalOperationUtility(row.value));
if(!full.length)throw new Error(`No legal full-depth operations for ${fixture.name} depth ${recursiveDepth}`);
const winner=full[0],rank=shallow.findIndex(row=>row.id===winner.id)+1;if(rank<1)throw new Error(`Deep winner missing from shallow legal set for ${fixture.name}`);
process.stdout.write(`${JSON.stringify({fixture:fixture.name,stateId:String(engine.id),recursiveDepth,proxyPath,tokensRemaining,legalOperations:full.length,configuredFreshMenuStrata:strata,fullDepthBestOperationId:winner.id,deepWinnerShallowRank:rank,fullDepthTopTwoGap:full[1]?winner.value-full[1].value:0,shallowTopTwoGap:shallow[1]?shallow[0].value-shallow[1].value:0})}\n`);
