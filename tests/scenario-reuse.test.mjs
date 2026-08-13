import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultBoard } from '../docs/js/data/defaultState.js';
import { LEGAL_STAT_POOLS } from '../docs/js/domain/rules.js';
import {
  evaluateBoardExpectedFast,
  getRawScenarioDiagnostics,
  resetRawScenarioDiagnostics,
} from '../docs/js/engine/scoring.js';
import { evaluateBoardTargetProbabilityFast } from '../docs/js/engine/targetProbability.js';
import { testData } from './test-data.mjs';

const TRAITS=['Fractal','Friendly','Vampiric','Unique','Benevolent'];

function changedBoard(kind){
  const board=structuredClone(defaultBoard);
  const banner=board.mid;
  const emblem=banner.emblems[0];
  if(kind==='quality'){
    emblem.qualityTier=emblem.qualityTier===5?4:emblem.qualityTier+1;
  }else if(kind==='trait'){
    emblem.trait=TRAITS.find(trait=>trait!==emblem.trait);
  }else{
    const used=new Set(banner.emblems.map(entry=>entry.stat));
    const replacement=LEGAL_STAT_POOLS[emblem.color].find(stat=>stat!==emblem.stat&&!used.has(stat));
    assert.ok(replacement);
    emblem.stat=replacement;
  }
  return board;
}

for(const objective of ['expected_score','target_probability']){
  for(const change of ['stat','quality','trait']){
    test(`raw role scenarios are reused across ${change} board changes for ${objective}`,()=>{
      const data=testData({optimizerIterations:32,rankingIterations:32});
      const base=structuredClone(defaultBoard);
      if(objective==='expected_score')evaluateBoardExpectedFast(base,data,32);
      else evaluateBoardTargetProbabilityFast(base,data,55_000,32);
      resetRawScenarioDiagnostics();
      if(objective==='expected_score')evaluateBoardExpectedFast(changedBoard(change),data,32);
      else evaluateBoardTargetProbabilityFast(changedBoard(change),data,55_000,32);
      const diagnostics=getRawScenarioDiagnostics();
      assert.ok(diagnostics.requests>0);
      assert.equal(diagnostics.cacheMisses,0);
      assert.equal(diagnostics.generations,0);
      assert.equal(diagnostics.cacheHits,diagnostics.requests);
    });
  }
}
