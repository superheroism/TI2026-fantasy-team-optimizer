import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateCalibration,
  isM5HCalibrationArtifactPath,
  readNamedArtifacts,
} from './m5h-benchmark-lib.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactRoot = path.resolve(process.argv[2] ?? path.join(root, 'm5h-calibration-artifacts'));
const reportPath = path.resolve(process.argv[3] ?? path.join(root, 'benchmarks/m5h-target-adaptive-calibration.json'));
const selectedPath = path.resolve(process.argv[4] ?? path.join(root, 'benchmarks/m5h-selected-candidate.json'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5h-target-calibration-fixtures.json'), 'utf8'));
const candidateConfig = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5h-target-adaptive-candidates.json'), 'utf8'));
const artifacts = readNamedArtifacts(artifactRoot, isM5HCalibrationArtifactPath);
const evaluated = evaluateCalibration({ manifest, candidateConfig, artifacts });
const sourceShas = [...new Set(artifacts.map((row) => row.value.sourceSha).filter(Boolean))];
const report = {
  schemaVersion: 1,
  package: 'M5H Adaptive Target-Probability t=3 Precision',
  corpus: 'calibration',
  generatedAt: new Date().toISOString(),
  manifestSeed: manifest.seed,
  fixtureCount: manifest.fixtures.length,
  thresholdCount: manifest.thresholds.length,
  expectedCases: manifest.fixtures.length * manifest.thresholds.length,
  candidateCount: candidateConfig.candidates.length,
  artifactFilter: 'isM5HCalibrationArtifactPath',
  admittedArtifactCount: artifacts.length,
  sourceShas,
  ...evaluated,
};
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (evaluated.selectedCandidate) {
  fs.writeFileSync(selectedPath, `${JSON.stringify({
    schemaVersion: 1,
    frozenAfterCalibration: true,
    candidateId: evaluated.selectedCandidateId,
    candidate: evaluated.selectedCandidate,
    calibrationManifestSeed: manifest.seed,
    calibrationReport: 'benchmarks/m5h-target-adaptive-calibration.json',
    sourceShas,
    holdoutRetuningPermitted: false,
  }, null, 2)}\n`);
} else if (fs.existsSync(selectedPath)) {
  fs.unlinkSync(selectedPath);
}
console.log(JSON.stringify({
  outcome: evaluated.outcome,
  selectedCandidateId: evaluated.selectedCandidateId,
  admittedArtifactCount: artifacts.length,
  sourceShas,
  reportPath,
  selectedPath: evaluated.selectedCandidate ? selectedPath : null,
}, null, 2));
