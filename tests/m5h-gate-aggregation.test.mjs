import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluateCalibration,
  isM5HCalibrationArtifactPath,
  isM5HHoldoutArtifactPath,
} from '../scripts/m5h-benchmark-lib.mjs';

test('M5H calibration artifact filter admits only explicitly named case artifacts', () => {
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-oracle-calibration-01-50000.json'), true);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-adaptive-A8-calibration-09-60000.json'), true);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-t2-current-calibration-03-55000.json'), true);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-t2-experimental-A1-calibration-03-55000.json'), true);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-preflight.json'), false);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-sentinel-calibration-01-50000.json'), false);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-adaptive-A9-calibration-01-50000.json'), false);
  assert.equal(isM5HCalibrationArtifactPath('/tmp/m5h-oracle-holdout-01-50000.json'), false);
});

test('M5H holdout artifact filter excludes calibration/preflight/sentinel JSON', () => {
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-oracle-holdout-01-50000.json'), true);
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-adaptive-holdout-09-60000.json'), true);
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-t2-experimental-holdout-04-55000.json'), true);
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-preflight.json'), false);
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-sentinel-holdout-01-50000.json'), false);
  assert.equal(isM5HHoldoutArtifactPath('/tmp/m5h-adaptive-A1-calibration-01-50000.json'), false);
});

test('M5H incomplete calibration outputs cannot qualify or count as agreements', () => {
  const manifest = { fixtures: Array.from({ length: 9 }, (_, i) => ({ id: `calibration-${String(i + 1).padStart(2, '0')}` })), thresholds: [50000, 55000, 60000] };
  const candidateConfig = {
    calibrationSelectionOrder: ['lower_max_oracle_regret'],
    candidates: [{
      id: 'A1',
      screen: { continuation: 'aggressive', widening: 'narrow' },
      refine: { continuation: 'aggressive', widening: 'wide' },
      rule: { kind: 'top_k', topK: 2, maxRefined: 2 },
    }],
  };
  const result = evaluateCalibration({ manifest, candidateConfig, artifacts: [] });
  assert.equal(result.outcome, 'C');
  assert.equal(result.selectedCandidate, null);
  assert.equal(result.candidateResults[0].qualifies, false);
  assert.equal(result.candidateResults[0].summary.agreements, 0);
});
