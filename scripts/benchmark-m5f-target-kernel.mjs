import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';

import {
  choosePreparedTargetSearch,
  choosePreparedTargetSearchReference,
  clearTargetSearchOptimizationCaches,
  getTargetSearchDiagnostics,
  prepareTargetCandidates,
  resetTargetSearchDiagnostics,
  setTargetSearchDiagnosticsEnabled,
} from '../docs/js/engine/targetSearch.js';

const ITERATIONS = 48;
const CANDIDATES = 16;
const THIRD_GROUPS = 64;
const SEARCH_CALLS = 1_200;
const TARGET_SCORE = 78;

let rngState = 0x6d2b79f5;
function random() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
  return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
}

function makePreparedGroup(label) {
  const raw = Array.from({ length: CANDIDATES }, (_, candidateIndex) => {
    const samples = Array.from({ length: ITERATIONS }, () => Math.floor(random() * 51));
    const mean = samples.reduce((sum, value) => sum + value, 0) / ITERATIONS;
    return {
      payload: `${label}:${candidateIndex}`,
      expected: mean + candidateIndex * 1e-6,
      samples,
    };
  });
  return prepareTargetCandidates(raw, ITERATIONS);
}

const first = makePreparedGroup('first');
const second = makePreparedGroup('second');
const thirds = Array.from({ length: THIRD_GROUPS }, (_, i) => makePreparedGroup(`third-${i}`));
const searches = Array.from({ length: SEARCH_CALLS }, (_, i) => [first, second, thirds[i % thirds.length]]);

function digestChoice(hash, choice) {
  hash.update(choice ? JSON.stringify([
    choice.hits,
    choice.expected,
    choice.selected,
    choice.samples,
  ]) : 'undefined');
}

function timedRun(fn) {
  const hash = crypto.createHash('sha256');
  const started = performance.now();
  for (const groups of searches) digestChoice(hash, fn(groups, TARGET_SCORE, ITERATIONS));
  return { runtimeMs: performance.now() - started, resultHash: hash.digest('hex') };
}

setTargetSearchDiagnosticsEnabled(false);
clearTargetSearchOptimizationCaches();
const reference = timedRun(choosePreparedTargetSearchReference);
clearTargetSearchOptimizationCaches();
const optimized = timedRun(choosePreparedTargetSearch);
assert.equal(optimized.resultHash, reference.resultHash, 'M5F kernel benchmark result hash mismatch');

clearTargetSearchOptimizationCaches();
resetTargetSearchDiagnostics();
setTargetSearchDiagnosticsEnabled(true);
for (let i = 0; i < Math.min(256, searches.length); i++) {
  choosePreparedTargetSearch(searches[i], TARGET_SCORE, ITERATIONS);
}
const diagnostics = getTargetSearchDiagnostics();
setTargetSearchDiagnosticsEnabled(false);

const memory = process.memoryUsage();
const output = {
  benchmark: 'm5f-target-kernel-development',
  authoritative: false,
  fixture: {
    iterations: ITERATIONS,
    candidatesPerPreparedGroup: CANDIDATES,
    thirdGroupIdentities: THIRD_GROUPS,
    searchCalls: SEARCH_CALLS,
    targetScore: TARGET_SCORE,
    firstSecondIdentityReused: true,
  },
  reference,
  optimized,
  speedupRatio: optimized.runtimeMs / reference.runtimeMs,
  diagnostics,
  memory: {
    heapUsed: memory.heapUsed,
    rss: memory.rss,
    arrayBuffers: memory.arrayBuffers,
  },
};

console.log(JSON.stringify(output, null, 2));
