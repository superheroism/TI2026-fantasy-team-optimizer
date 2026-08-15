import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const worker = fileURLToPath(new URL('./benchmark-m5h-target-worker.mjs', import.meta.url));
const [corpus, fixtureId, targetText, mode, candidateIdOrOutput, maybeOutput] = process.argv.slice(2);
const targetScore = Number(targetText);
const needsCandidate = mode === 'adaptive' || mode === 't2-experimental';
const candidateId = needsCandidate ? candidateIdOrOutput : undefined;
const outputPath = needsCandidate ? maybeOutput : candidateIdOrOutput;
if (!corpus || !fixtureId || !targetScore || !mode || !outputPath || (needsCandidate && !candidateId)) {
  throw new Error('Usage: benchmark-m5h-target-case.mjs <corpus> <fixture> <target> <mode> [candidate] <output>');
}

const timeoutMs = mode === 'oracle' ? 600_000 : (mode === 'adaptive' || mode === 'baseline') ? 60_000 : 180_000;
const args = ['--expose-gc', worker, corpus, fixtureId, String(targetScore), mode];
if (needsCandidate) args.push(candidateId);
const started = Date.now();
const child = spawnSync(process.execPath, args, {
  cwd: root,
  encoding: 'utf8',
  timeout: timeoutMs,
  maxBuffer: 128 * 1024 * 1024,
});
const elapsedMs = Date.now() - started;
let output;
if (child.error?.code === 'ETIMEDOUT' || child.signal) {
  output = {
    corpus,
    fixtureId,
    targetScore,
    mode,
    candidateId: candidateId ?? null,
    status: 'timeout',
    elapsedMs,
    timeoutMs,
    signal: child.signal ?? null,
    stderr: child.stderr?.slice(-8000) ?? '',
  };
} else if (child.status !== 0) {
  output = {
    corpus,
    fixtureId,
    targetScore,
    mode,
    candidateId: candidateId ?? null,
    status: 'error',
    elapsedMs,
    timeoutMs,
    exitCode: child.status,
    stderr: child.stderr?.slice(-12000) ?? '',
    stdout: child.stdout?.slice(-8000) ?? '',
  };
} else {
  try {
    output = {
      ...JSON.parse(child.stdout.trim()),
      status: 'completed',
      elapsedMs,
      timeoutMs,
    };
  } catch (error) {
    output = {
      corpus,
      fixtureId,
      targetScore,
      mode,
      candidateId: candidateId ?? null,
      status: 'error',
      elapsedMs,
      timeoutMs,
      error: String(error),
      stdout: child.stdout?.slice(-12000) ?? '',
    };
  }
}
fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  corpus,
  fixtureId,
  targetScore,
  mode,
  candidateId: candidateId ?? null,
  status: output.status,
  runtimeMs: output.runtimeMs ?? output.elapsedMs,
  recommendationKey: output.recommendationKey ?? null,
  screenWinnerKey: output.screenWinnerKey ?? null,
  output: outputPath,
}, null, 2));
if (output.status === 'error') process.exitCode = 2;
