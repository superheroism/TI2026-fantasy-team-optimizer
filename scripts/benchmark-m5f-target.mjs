import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { compareTargetRuns } from './m5e-benchmark-lib.mjs';
import { evaluateM5FGate } from './m5f-benchmark-lib.mjs';

const M5F_BASE_SHA = 'b5b9beae74138db46252eadaaa8d024bb7c29931';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const optimizedWorker = fileURLToPath(new URL('./benchmark-m5f-target-case.mjs', import.meta.url));
const reportPath = path.join(root, 'benchmarks', 'm5f-exact-target-search.json');
const targetScore = 55_000;
const menuIds = ['green-stat-all', 'red-quality-all', 'blue-trait-all'];
const optimizedCases = [
  { id: 'optimized-t3-aggressive-only', horizon: 3, fidelityId: 'aggressive', wideningId: 'none', timeoutMs: 600_000, purpose: 'Same-runner exact-kernel speed control.' },
  { id: 'optimized-t3-current-oracle', horizon: 3, fidelityId: 'current', wideningId: 'none', timeoutMs: 600_000, purpose: 'Optimized current-fidelity exact root-policy oracle.' },
  { id: 'optimized-t3-aggressive-wide', horizon: 3, fidelityId: 'aggressive', wideningId: 'wide', timeoutMs: 60_000, purpose: 'Frozen M5C aggressive + M5D Wide feasibility candidate.' },
];
const baselineSpec = { id: 'baseline-t3-aggressive-only', horizon: 3, fidelityId: 'aggressive', wideningId: 'none', timeoutMs: 600_000, purpose: 'Clean M5F_BASE_SHA same-runner aggressive-only control.' };

if (process.argv.includes('--plan')) {
  console.log(JSON.stringify({
    package: 'M5F exact target-search kernel acceleration',
    baseSha: M5F_BASE_SHA,
    objective: 'target_probability',
    targetScore,
    board: 'default benchmark board',
    menuIds,
    tokensRemaining: 10,
    menuRerollAvailable: true,
    productionHorizon: 2,
    experimentHorizon: 3,
    continuationSchedule: [4, 2, 1],
    wideningSchedule: [12, 8, 4],
    aggressiveRuntimeRatioCeiling: 0.80,
    candidateRuntimeCeilingMs: 60_000,
    oracleRuntimeCeilingMs: 600_000,
    oracleMaxRssBytes: 6 * 1024 * 1024 * 1024,
    cases: [baselineSpec, ...optimizedCases],
    authoritativeRunner: 'GitHub Actions / ubuntu-latest / Node 22 / same job',
    profilerOverhead: false,
  }, null, 2));
  process.exit(0);
}

const preflightPassed = process.argv.includes('--preflight-passed');
const optimizedSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const runtime = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  cpu: os.cpus()[0]?.model ?? null,
  logicalCpus: os.cpus().length,
  totalMemoryBytes: os.totalmem(),
};

function runCase(spec, worker, cwd, sourceSha) {
  console.log(`[M5F] ${spec.id} | t=${spec.horizon} | ${spec.fidelityId} | ${spec.wideningId} | timeout=${spec.timeoutMs}ms`);
  const started = Date.now();
  const child = spawnSync(process.execPath, ['--expose-gc', worker, spec.id, String(spec.horizon), spec.fidelityId, spec.wideningId], {
    cwd,
    encoding: 'utf8',
    timeout: spec.timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
  });
  const elapsedMs = Date.now() - started;
  if (child.error?.code === 'ETIMEDOUT' || child.signal) {
    return { ...spec, sourceSha, status: 'timeout', elapsedMs, signal: child.signal ?? null, stderr: child.stderr?.slice(-4000) ?? '' };
  }
  if (child.status !== 0) {
    return { ...spec, sourceSha, status: 'error', elapsedMs, exitCode: child.status, stderr: child.stderr?.slice(-8000) ?? '', stdout: child.stdout?.slice(-4000) ?? '' };
  }
  try {
    return { ...JSON.parse(child.stdout.trim()), sourceSha, status: 'completed', elapsedMs, timeoutMs: spec.timeoutMs, purpose: spec.purpose };
  } catch (error) {
    return { ...spec, sourceSha, status: 'error', elapsedMs, error: String(error), stdout: child.stdout?.slice(-8000) ?? '' };
  }
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'm5f-baseline-'));
const baselineDir = path.join(tempRoot, 'base');
let baseline;
try {
  execFileSync('git', ['worktree', 'add', '--detach', baselineDir, M5F_BASE_SHA], { cwd: root, stdio: 'inherit' });
  const baselineSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: baselineDir, encoding: 'utf8' }).trim();
  if (baselineSha !== M5F_BASE_SHA) throw new Error(`M5F baseline worktree mismatch: ${baselineSha}`);
  const baselineWorker = path.join(baselineDir, 'scripts', 'benchmark-m5e-target-case.mjs');
  baseline = runCase(baselineSpec, baselineWorker, baselineDir, baselineSha);
} finally {
  try { execFileSync('git', ['worktree', 'remove', '--force', baselineDir], { cwd: root, stdio: 'ignore' }); } catch {}
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

const optimizedRuns = optimizedCases.map((spec) => runCase(spec, optimizedWorker, root, optimizedSha));
const runs = [baseline, ...optimizedRuns];
const byId = new Map(runs.map((run) => [run.id, run]));
const optimizedAggressive = byId.get('optimized-t3-aggressive-only');
const oracle = byId.get('optimized-t3-current-oracle');
const candidate = byId.get('optimized-t3-aggressive-wide');
const comparison = compareTargetRuns(oracle, candidate);
const aggressiveOnlyComparison = compareTargetRuns(oracle, optimizedAggressive);
const aggressiveRuntimeRatio = baseline?.status === 'completed' && optimizedAggressive?.status === 'completed'
  ? optimizedAggressive.runtimeMs / baseline.runtimeMs
  : null;

let report = {
  generatedAt: new Date().toISOString(),
  package: 'M5F exact target-search kernel acceleration',
  baseSha: M5F_BASE_SHA,
  optimizedSha,
  runtime,
  preflightPassed,
  sameRunnerBaselineControl: true,
  authoritativeIntent: 'Baseline and optimized aggressive-only controls run sequentially in isolated Node 22 processes on the same GitHub Actions runner; profiler overhead excluded.',
  productionHorizon: 2,
  frozenExperiment: {
    objective: 'target_probability',
    targetScore,
    board: 'default benchmark board',
    menuIds,
    tokensRemaining: 10,
    menuRerollAvailable: true,
    modeledHorizon: 3,
    continuationSchedule: [4, 2, 1],
    wideningSchedule: [12, 8, 4],
    aggressiveRuntimeRatioCeiling: 0.80,
  },
  timeouts: { baselineAggressiveMs: 600_000, optimizedAggressiveMs: 600_000, oracleMs: 600_000, candidateMs: 60_000 },
  memoryGuard: { oracleMaxRssBytes: 6 * 1024 * 1024 * 1024 },
  expectedScoreDiagnosticMeaning: 'Expected final score remains the existing secondary diagnostic/tie-break context; target probability is the target-mode search utility.',
  developmentProfile: {
    runId: 31865479477,
    profileSourceSha: '2e515459ec917e44df4dd824a7e95f84e44f7b65',
    note: 'Engineering-only Node 22 profile of the unchanged M5E traversal with identity diagnostics; not the authoritative speed denominator.',
    runtimeMs: 132428.425164,
    searches: 1738200,
    uniquePreparedGroupTuples: 1738200,
    reusedPreparedGroupTuples: 0,
    preparedPairIdentity: { coreMid: { unique: 419328, reused: 1318872 }, midSupport: { unique: 483520, reused: 1254680 }, coreSupport: { unique: 502704, reused: 1235496 } },
    pairBranches: 299090699,
    triplesConsidered: 296256334,
    scenarioChecks: 17404506588,
    survivingPairSampleBuilds: 20044527,
    combinatorialSearchMs: 114850.93649300585,
  },
  cases: [baselineSpec, ...optimizedCases],
  runs,
  aggressiveRuntimeRatio,
  comparison,
  aggressiveOnlyComparison,
};
report = { ...report, gate: evaluateM5FGate(report) };
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const executionErrors = runs.filter((run) => run?.status === 'error');
console.log('\n[M5F] FINAL');
console.log(JSON.stringify({
  outcome: report.gate.outcome,
  gatePassed: report.gate.passed,
  baseSha: M5F_BASE_SHA,
  optimizedSha,
  baselineRuntimeMs: baseline?.runtimeMs ?? baseline?.elapsedMs ?? null,
  optimizedAggressiveRuntimeMs: optimizedAggressive?.runtimeMs ?? optimizedAggressive?.elapsedMs ?? null,
  aggressiveRuntimeRatio,
  oracleStatus: oracle?.status ?? null,
  oracleRuntimeMs: oracle?.runtimeMs ?? oracle?.elapsedMs ?? null,
  candidateStatus: candidate?.status ?? null,
  candidateRuntimeMs: candidate?.runtimeMs ?? candidate?.elapsedMs ?? null,
  oracleRecommendation: oracle?.recommendationKey ?? null,
  candidateRecommendation: candidate?.recommendationKey ?? null,
  comparison,
  report: 'benchmarks/m5f-exact-target-search.json',
  executionErrors: executionErrors.length,
}, null, 2));
if (executionErrors.length) process.exitCode = 2;
