import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';

const candidates=JSON.parse(fs.readFileSync('benchmarks/m6c-expanded-candidates.json','utf8'));
const calibration=JSON.parse(fs.readFileSync('benchmarks/m6c-expanded-calibration-fixtures.json','utf8'));
const holdout=JSON.parse(fs.readFileSync('benchmarks/m6c-expanded-holdout-fixtures.json','utf8'));

test('M6C fixtures and candidate family are frozen to expanded_5 t=2 and disabled for production',()=>{
  assert.equal(defaultBoard.layoutId??'legacy_3','legacy_3');
  for(const corpus of [calibration,holdout]){assert.equal(corpus.layoutId,'expanded_5');assert.equal(corpus.horizon,2);assert.ok(corpus.cases.length>0);for(const c of corpus.cases)assert.equal(c.layoutId,undefined);}
  assert.equal(candidates.layoutId,'expanded_5');assert.equal(candidates.horizon,2);assert.equal(candidates.productionEnabled,false);assert.deepEqual(candidates.candidates.map(x=>x.maxRefinedBoardActions),[2,4,6]);
});

test('M6C benchmark scripts cannot request target t=3/t=4 or M5H holdout',()=>{
  const sources=['scripts/m6c-benchmark-lib.mjs','scripts/benchmark-m6c-case.mjs','scripts/benchmark-m6c.mjs'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
  assert.doesNotMatch(sources,/modeledHorizonOverride\s*:\s*[34]/);
  assert.doesNotMatch(sources,/m5h-target-holdout/i);
  assert.match(sources,/modeledHorizonOverride:2/);
});

test('legacy exact expected-score behavior remains deterministic and horizon <=2',()=>{
  const raw=JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json','utf8')),titles=JSON.parse(fs.readFileSync('data/ti2026-title-model.json','utf8')),data=convertStatisticalModel(raw,titles);
  const menu=['green-stat-all','red-quality-all','blue-trait-all'].map(id=>cloneAction(ACTION_BY_ID.get(id)));
  const state={board:structuredClone(defaultBoard),tokensRemaining:2,menu,menuRerollAvailable:true,username:'M6C isolation',objective:'expected_score'};
  const a=recommendNextAction(state,data,true),aDiag=getLastOptimizerEngineDiagnostics(),b=recommendNextAction(state,data,true),bDiag=getLastOptimizerEngineDiagnostics();
  assert.equal(aDiag.modeledHorizon,2);assert.equal(bDiag.modeledHorizon,2);assert.deepEqual(a.recommendation.action,b.recommendation.action);assert.equal(a.recommendation.expectedFinalUtility,b.recommendation.expectedFinalUtility);
});
