import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { BOARD_LAYOUTS } from '../docs/js/domain/rules.js';
import { evaluateBoardExpectedFast } from '../docs/js/engine/scoring.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import {
  boardAdapterContext, boardToEngineState, engineStateToBoard, encodeBannerState,
} from '../docs/js/engine/stateEncoding.js';
import {
  clearTransitionCache, enumerateCompactBannerOperation, getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';

const layoutId=process.argv[2];
const caseName=process.argv[3];
const horizon=Number(process.argv[4]);
if(!['legacy_3','expanded_5'].includes(layoutId)||!Number.isInteger(horizon)||horizon<1)throw new Error('usage: benchmark-m6a-layout-case.mjs <legacy_3|expanded_5> <case> <horizon>');
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
const state={board,tokensRemaining:10,menu,menuRerollAvailable:true,username:'M6A benchmark',objective:caseName==='target_probability'?'target_probability':'expected_score',...(definition.targetScore?{targetScore:definition.targetScore}:{})};

function memory(){const m=process.memoryUsage();return {heapUsed:m.heapUsed,heapTotal:m.heapTotal,rss:m.rss,external:m.external,maxRSS:process.resourceUsage().maxRSS};}
function timed(fn){const t=performance.now(),value=fn();return {value,runtimeMs:performance.now()-t};}

const iterations=20_000;
const codec=timed(()=>{
  let last;
  const ctx=boardAdapterContext(board);
  for(let i=0;i<iterations;i++){const state=boardToEngineState(board);last=engineStateToBoard(state,ctx);}
  return last;
});

const terminal=timed(()=>evaluateBoardExpectedFast(board,data,data.simulation.optimizerIterations));

const transitionOp=menu.find(op=>op.kind!=='quality_redistribution')??menu[0];
const role=['core','mid','support'].find(role=>transitionOp.kind==='quality_increase'||!('color' in transitionOp)||board[role].emblems.some(e=>e.color===transitionOp.color))??'core';
const bannerId=encodeBannerState(board[role],layoutId);
clearTransitionCache();resetTransitionDiagnostics();
const coldTransition=timed(()=>enumerateCompactBannerOperation(role,bannerId,transitionOp,true,layoutId));
const coldTransitionDiagnostics=getTransitionDiagnostics();
resetTransitionDiagnostics();
const warmTransition=timed(()=>enumerateCompactBannerOperation(role,bannerId,transitionOp,true,layoutId));
const warmTransitionDiagnostics=getTransitionDiagnostics();

if(global.gc)global.gc();
const memoryBefore=memory();
const optimizer=timed(()=>recommendNextAction(state,data,true,{modeledHorizonOverride:horizon}));
const memoryAfter=memory();
const result=optimizer.value;
const resultRow={
  layoutId,case:caseName,horizon,objective:state.objective,targetScore:state.targetScore??null,
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  codec:{iterations,runtimeMs:codec.runtimeMs,perOperationUs:codec.runtimeMs*1000/iterations},
  terminalScoring:{runtimeMs:terminal.runtimeMs,expected:terminal.value},
  transition:{
    operationId:transitionOp.id,role,
    coldMs:coldTransition.runtimeMs,warmMs:warmTransition.runtimeMs,
    reachableOutcomes:coldTransition.value.length,
    probability:coldTransition.value.reduce((s,x)=>s+x.probability,0),
    coldDiagnostics:coldTransitionDiagnostics,warmDiagnostics:warmTransitionDiagnostics,
  },
  optimizer:{
    runtimeMs:optimizer.runtimeMs,
    recommendation:formatAction(result.recommendation.action,state),
    utility:result.recommendation.expectedFinalUtility,
    score:result.recommendation.expectedFinalScore,
    actionCount:result.ranking.length,
    engineDiagnostics:getLastOptimizerEngineDiagnostics(),
  },
  memory:{before:memoryBefore,after:memoryAfter,heapDelta:memoryAfter.heapUsed-memoryBefore.heapUsed,rssDelta:memoryAfter.rss-memoryBefore.rss},
};
process.stdout.write(`${JSON.stringify(resultRow)}\n`);
