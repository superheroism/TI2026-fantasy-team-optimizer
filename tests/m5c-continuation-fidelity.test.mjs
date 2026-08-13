import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTINUATION_FIDELITY_PRESETS, continuationFidelityReport, resolveFreshMenuOutcomeStrata } from '../build/js/engine/continuationFidelity.js';
import { getExperimentalContinuationFidelity, setExperimentalContinuationFidelity } from '../build/js/engine/optimizerContinuation.js';

test('M5C schedules are explicit, deterministic, and capped by configured fidelity',()=>{
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.current,3,8),8);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,1,8),8);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,2,8),6);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,4,8),4);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,1,8),6);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,2,8),4);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.aggressive,3,8),1);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.high,1,5),5);
  assert.equal(resolveFreshMenuOutcomeStrata(CONTINUATION_FIDELITY_PRESETS.medium,2,3),3);
});

test('M5C experimental fidelity cannot alter t<=2 production semantics',()=>{
  setExperimentalContinuationFidelity({modeledHorizon:2,policy:CONTINUATION_FIDELITY_PRESETS.aggressive});
  assert.equal(getExperimentalContinuationFidelity(),undefined);
  setExperimentalContinuationFidelity({modeledHorizon:3,policy:CONTINUATION_FIDELITY_PRESETS.medium});
  assert.deepEqual(getExperimentalContinuationFidelity()?.policy.freshMenuOutcomeStrataByDepth,[6,4,2]);
  setExperimentalContinuationFidelity(undefined);
  assert.equal(getExperimentalContinuationFidelity(),undefined);
});

test('M5C fidelity reports are serializable and preserve root-entry metadata',()=>{
  const report=continuationFidelityReport(CONTINUATION_FIDELITY_PRESETS.high,8,12);
  assert.deepEqual(JSON.parse(JSON.stringify(report)),{id:'high',description:CONTINUATION_FIDELITY_PRESETS.high.description,freshMenuOutcomeStrataByDepth:[8,6,4],baseFreshMenuOutcomeStrata:8,rootContinuationEntryStrata:12});
});
