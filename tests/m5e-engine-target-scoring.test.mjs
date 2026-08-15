import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { ACTION_CATALOG } from '../docs/js/data/actionCatalog.js';
import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { enumerateEngineOperation } from '../docs/js/engine/compactTransitions.js';
import { createEngineTargetScorer } from '../docs/js/engine/engineTargetScoring.js';
import { evaluateBoardTargetProbabilityFast } from '../docs/js/engine/targetProbability.js';
import {
  boardAdapterContext,
  boardToEngineState,
  engineStateToBoard,
} from '../docs/js/engine/stateEncoding.js';

const raw=JSON.parse(fs.readFileSync(new URL('../data/ti2026-statistical-model.json',import.meta.url),'utf8'));
const titles=JSON.parse(fs.readFileSync(new URL('../data/ti2026-title-model.json',import.meta.url),'utf8'));
const data=convertStatisticalModel(raw,titles);
const roles=['core','mid','support'];

test('compact target scorer is exactly equivalent to descriptive target scoring across reachable one-action states',()=>{
  const board=structuredClone(defaultBoard),targetScore=55_000;
  const context=boardAdapterContext(board),initial=boardToEngineState(board);
  const scorer=createEngineTargetScorer(context,data,targetScore,data.simulation.optimizerIterations);
  const states=new Map([[initial.id,initial]]);

  for(const operation of ACTION_CATALOG){
    for(const role of roles){
      for(const outcome of enumerateEngineOperation(initial,role,operation,true)){
        states.set(outcome.nextState.id,outcome.nextState);
      }
    }
  }

  for(const engine of states.values()){
    const descriptive=engineStateToBoard(engine,context);
    assert.equal(
      scorer.evaluate(engine),
      evaluateBoardTargetProbabilityFast(descriptive,data,targetScore,data.simulation.optimizerIterations),
      `mismatch for engine state ${engine.id}`,
    );
  }

  const diagnostics=scorer.getDiagnostics();
  assert.ok(diagnostics.bannerCacheHits>0);
  assert.ok(diagnostics.bannerMaterializations<states.size*3);
  assert.equal(diagnostics.bannerCacheEntries,diagnostics.bannerCacheMisses);
});
