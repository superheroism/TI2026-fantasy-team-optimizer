import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { formatAction, getLastOptimizerEngineDiagnostics, recommendNextAction } from '../docs/js/engine/optimizer.js';
import {
  getRawScenarioDiagnostics,
  resetRawScenarioDiagnostics,
} from '../docs/js/engine/scoring.js';
import {
  clearTransitionCache,
  getTransitionDiagnostics,
  resetTransitionDiagnostics,
} from '../docs/js/engine/compactTransitions.js';

const CASES={
  default:{ids:['green-stat-all','red-quality-all','blue-trait-all'],objective:'expected_score'},
  quality_heavy:{ids:['quality-redistribution','red-quality-all','blue-trait-all'],objective:'expected_score'},
  stat_heavy:{ids:['green-stat-all','red-stat-all','blue-stat-all'],objective:'expected_score'},
  trait_heavy:{ids:['green-trait-all','red-trait-all','blue-trait-all'],objective:'expected_score'},
  global_quality:{ids:['quality-increase-one','quality-redistribution','green-quality-all'],objective:'expected_score'},
  target_55k:{ids:['green-stat-all','red-quality-all','blue-trait-all'],objective:'target_probability',targetScore:55_000},
};

const caseName=process.argv[2];
const horizon=Number(process.argv[3]);
const definition=CASES[caseName];
if(!definition||!Number.isInteger(horizon)||horizon<1)throw new Error(`Usage: benchmark-m5-case.mjs <${Object.keys(CASES).join('|')}> <horizon>`);

const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const data=convertStatisticalModel(raw,titles);
const menu=definition.ids.map(id=>cloneAction(ACTION_BY_ID.get(id)));
const state={
  board:structuredClone(defaultBoard),tokensRemaining:10,menu,menuRerollAvailable:true,
  username:'M5 benchmark',objective:definition.objective,
  ...(definition.targetScore===undefined?{}:{targetScore:definition.targetScore}),
};

function memorySnapshot(){
  const usage=process.memoryUsage();
  return {heapUsed:usage.heapUsed,heapTotal:usage.heapTotal,rss:usage.rss,external:usage.external};
}
function run(label,{clearTransitions}){
  if(global.gc)global.gc();
  if(clearTransitions)clearTransitionCache();
  resetTransitionDiagnostics();
  resetRawScenarioDiagnostics();
  const memoryStart=memorySnapshot();
  const maxRssStart=process.resourceUsage().maxRSS;
  const started=performance.now();
  const result=recommendNextAction(state,data,true,{modeledHorizonOverride:horizon});
  const runtimeMs=performance.now()-started;
  const memoryEnd=memorySnapshot();
  return {
    label,runtimeMs,
    recommendation:formatAction(result.recommendation.action,state),
    recommendationKey:result.recommendation.action,
    utility:result.recommendation.expectedFinalUtility,
    score:result.recommendation.expectedFinalScore,
    runnerUp:result.ranking[1]?{
      action:formatAction(result.ranking[1].action,state),
      utility:result.ranking[1].expectedFinalUtility,
      gap:result.recommendation.expectedFinalUtility-result.ranking[1].expectedFinalUtility,
    }:null,
    memory:{start:memoryStart,end:memoryEnd,heapDelta:memoryEnd.heapUsed-memoryStart.heapUsed,maxRssStart,maxRssEnd:process.resourceUsage().maxRSS},
    engineDiagnostics:getLastOptimizerEngineDiagnostics(),
    transitionDiagnostics:getTransitionDiagnostics(),
    rawScenarioDiagnostics:getRawScenarioDiagnostics(),
  };
}

const cold=run('cold',{clearTransitions:true});
const warm=run('warm',{clearTransitions:false});
process.stdout.write(`${JSON.stringify({case:caseName,horizon,objective:definition.objective,cold,warm})}\n`);
