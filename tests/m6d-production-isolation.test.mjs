import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { recommendNextAction, getLastOptimizerEngineDiagnostics } from '../docs/js/engine/optimizer.js';

const candidates=JSON.parse(fs.readFileSync('benchmarks/m6d-expanded-adaptive-candidates.json','utf8'));
const calibration=JSON.parse(fs.readFileSync('benchmarks/m6d-expanded-calibration-fixtures.json','utf8'));
const holdout=JSON.parse(fs.readFileSync('benchmarks/m6d-expanded-holdout-fixtures.json','utf8'));

test('M6D is frozen to expanded_5 t=2 and disabled for production',()=>{
  assert.equal(defaultBoard.layoutId??'legacy_3','legacy_3');
  for(const corpus of [calibration,holdout]){assert.equal(corpus.layoutId,'expanded_5');assert.equal(corpus.horizon,2);assert.ok(corpus.cases.length>=12);}
  assert.equal(candidates.layoutId,'expanded_5');assert.equal(candidates.horizon,2);assert.equal(candidates.productionEnabled,false);
  assert.deepEqual(candidates.candidates.map(x=>x.stages),[[2,4,6],[2,4,6],[2,4,6]]);
  assert.ok(candidates.candidates.every(x=>x.exactFallback===true));
});

test('M6D scripts cannot request target t=3/t=4 or consume M5H holdout',()=>{
  const sources=['scripts/m6d-benchmark-lib.mjs','scripts/benchmark-m6d-case.mjs','scripts/benchmark-m6d.mjs'].map(p=>fs.readFileSync(p,'utf8')).join('\n');
  assert.doesNotMatch(sources,/modeledHorizonOverride\s*:\s*[34]/);
  assert.doesNotMatch(sources,/m5h-target-holdout/i);
});

test('legacy expected-score and target-probability production behavior remains deterministic at horizon <=2',()=>{
  const raw=JSON.parse(fs.readFileSync('data/ti2026-statistical-model.json','utf8')),titles=JSON.parse(fs.readFileSync('data/ti2026-title-model.json','utf8')),data=convertStatisticalModel(raw,titles);
  const menu=['green-stat-all','red-quality-all','blue-trait-all'].map(id=>cloneAction(ACTION_BY_ID.get(id)));
  for(const objective of ['expected_score','target_probability']){
    const state={board:structuredClone(defaultBoard),tokensRemaining:2,menu,menuRerollAvailable:true,username:`M6D isolation ${objective}`,objective,...(objective==='target_probability'?{targetScore:55000}:{})};
    const a=recommendNextAction(state,data,true),aDiag=getLastOptimizerEngineDiagnostics(),b=recommendNextAction(state,data,true),bDiag=getLastOptimizerEngineDiagnostics();
    assert.ok(aDiag.modeledHorizon<=2);assert.ok(bDiag.modeledHorizon<=2);assert.deepEqual(a.recommendation.action,b.recommendation.action);assert.equal(a.recommendation.expectedFinalUtility,b.recommendation.expectedFinalUtility);
  }
});
