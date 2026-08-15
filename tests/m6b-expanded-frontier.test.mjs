import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { DEFAULT_LAYOUT_ID } from '../docs/js/domain/rules.js';

const baseline=JSON.parse(fs.readFileSync(new URL('../benchmarks/m6b-expanded-frontier-baseline.json',import.meta.url),'utf8'));

function run(layoutId,caseName,horizon){
  return baseline.runs.find(x=>x.layoutId===layoutId&&x.case===caseName&&x.horizon===horizon);
}

test('M6B freezes the M6A main head and production isolation',()=>{
  assert.equal(baseline.m6bBaseSha,'a3505bbd25d7cac47d115452b924a2f3f8eda4ae');
  assert.equal(DEFAULT_LAYOUT_ID,'legacy_3');
  assert.deepEqual(baseline.production,{layoutId:'legacy_3',maxModeledHorizon:2,expandedDefault:false});
  assert.deepEqual(baseline.semantics,{
    newSearchApproximation:false,
    m5hHoldoutConsumed:false,
    targetT3Run:false,
    targetT4Run:false,
    scenarioFidelityChanged:false,
  });
});

test('M6B authoritative baseline contains the complete required exact matrix',()=>{
  assert.equal(baseline.summary.completed,12);
  assert.equal(baseline.summary.timeouts,0);
  assert.equal(baseline.summary.errors,0);
  for(const [caseName,horizon] of [['stat_heavy',1],['stat_heavy',2],['quality_heavy',2],['trait_heavy',2],['global_quality',2],['target_probability',2]]){
    assert.equal(run('legacy_3',caseName,horizon)?.status,'completed');
    assert.equal(run('expanded_5',caseName,horizon)?.status,'completed');
  }
});

test('M6B target frontier reproduces the corrected M6A scalar-state counts exactly',()=>{
  const legacy=run('legacy_3','target_probability',2);
  const expanded=run('expanded_5','target_probability',2);
  assert.equal(legacy.frontier.targetScalarStates,6563);
  assert.equal(expanded.frontier.targetScalarStates,17862);
  assert.equal(legacy.frontier.targetScenarioChecks,432886346);
  assert.equal(expanded.frontier.targetScenarioChecks,1383756976);
});

test('M6B proves target pair and suffix caches are not capacity-thrashing at expanded t2',()=>{
  const expanded=run('expanded_5','target_probability',2);
  assert.equal(expanded.frontier.targetPairCacheResets,0);
  assert.equal(expanded.frontier.targetSuffixCacheResets,0);
  assert.ok(expanded.frontier.targetPairCacheEstimatedBytes<256*1024*1024);
  assert.ok(expanded.frontier.targetPairSampleBuildMs+expanded.frontier.targetSuffixSummaryBuildMs<expanded.frontier.targetKernelMs*.1);
});

test('M6B confirms transition aggregation already precedes downstream expanded target work',()=>{
  const expanded=run('expanded_5','target_probability',2);
  assert.ok(expanded.frontier.rawTransitionOutcomesGenerated>=expanded.frontier.aggregatedTransitionOutcomes);
  assert.equal(
    expanded.frontier.rawTransitionOutcomesGenerated-expanded.frontier.aggregatedTransitionOutcomes,
    expanded.frontier.duplicateTransitionOutcomesCollapsed,
  );
  assert.ok(expanded.frontier.duplicateTransitionOutcomesCollapsed>0);
});
