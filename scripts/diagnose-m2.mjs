import fs from 'node:fs';
import { performance } from 'node:perf_hooks';

import { convertStatisticalModel } from '../docs/js/data/statisticalModel.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../docs/js/data/actionCatalog.js';
import { formatAction, recommendNextAction } from '../docs/js/engine/optimizer.js';
import {
  getTargetDiagnostics,
  resetTargetDiagnostics,
  setTargetDiagnosticsEnabled,
} from '../docs/js/engine/targetProbability.js';

const raw = JSON.parse(
  fs.readFileSync(new URL('../data/ti2026-statistical-model.json', import.meta.url), 'utf8'),
);
const titles = JSON.parse(
  fs.readFileSync(new URL('../data/ti2026-title-model.json', import.meta.url), 'utf8'),
);

const menuIds = ['green-stat-all', 'red-quality-all', 'blue-trait-all'];
const data = convertStatisticalModel(raw, titles);
const menu = menuIds.map((id) => cloneAction(ACTION_BY_ID.get(id)));
const state = {
  board: structuredClone(defaultBoard),
  tokensRemaining: 10,
  menu,
  menuRerollAvailable: true,
  username: 'M2 diagnostics',
  objective: 'target_probability',
  targetScore: 55_000,
};

resetTargetDiagnostics();
setTargetDiagnosticsEnabled(true);
const started = performance.now();
const result = recommendNextAction(state, data, true);
const elapsedMs = performance.now() - started;
setTargetDiagnosticsEnabled(false);

const diagnostics = getTargetDiagnostics();
const avg = (sum, count) => (count ? sum / count : 0);
const pct = (part, total) => (total ? (100 * part) / total : 0);

console.log(`M2 target-search diagnostics (${elapsedMs.toFixed(1)} ms)`);
console.log(`recommendation                  ${formatAction(result.recommendation.action, state)}`);
console.log(`unique target boards            ${diagnostics.boardCacheMisses.toLocaleString()}`);
console.log(`target board cache hits          ${diagnostics.boardCacheHits.toLocaleString()}`);
console.log(`target board cache hit rate      ${pct(diagnostics.boardCacheHits, diagnostics.boardCacheHits + diagnostics.boardCacheMisses).toFixed(1)}%`);
console.log(`prepared-role cache hit rate     ${pct(diagnostics.preparedRoleCacheHits, diagnostics.preparedRoleCacheHits + diagnostics.preparedRoleCacheMisses).toFixed(1)}%`);

for (const role of ['core', 'mid', 'support']) {
  console.log(
    `${role.padEnd(7)} candidates avg             ${avg(diagnostics.candidatesBeforePruning[role], diagnostics.candidateSets[role]).toFixed(2)} → ${avg(diagnostics.candidatesAfterPruning[role], diagnostics.candidateSets[role]).toFixed(2)}`,
  );
}

console.log(`prefixes considered             ${diagnostics.prefixesConsidered.toLocaleString()}`);
console.log(`prefix-bound pruned             ${diagnostics.prefixBoundPruned.toLocaleString()} (${pct(diagnostics.prefixBoundPruned, diagnostics.prefixesConsidered).toFixed(1)}%)`);
console.log(`Core branches                   ${diagnostics.coreBranchesConsidered.toLocaleString()}`);
console.log(`Core-bound pruned               ${diagnostics.coreBranchesPruned.toLocaleString()} (${pct(diagnostics.coreBranchesPruned, diagnostics.coreBranchesConsidered).toFixed(1)}%)`);
console.log(`Core+Mid branches               ${diagnostics.pairBranchesConsidered.toLocaleString()}`);
console.log(`pair-bound pruned               ${diagnostics.pairBranchesPruned.toLocaleString()} (${pct(diagnostics.pairBranchesPruned, diagnostics.pairBranchesConsidered).toFixed(1)}%)`);
console.log(`full triples considered         ${diagnostics.triplesConsidered.toLocaleString()}`);
console.log(`triples completed               ${diagnostics.triplesCompleted.toLocaleString()}`);
console.log(`triples early-terminated        ${diagnostics.triplesEarlyTerminated.toLocaleString()} (${pct(diagnostics.triplesEarlyTerminated, diagnostics.triplesConsidered).toFixed(1)}%)`);
console.log(`scenario checks                 ${diagnostics.scenarioChecks.toLocaleString()}`);
console.log(`  prefix bounds                 ${diagnostics.prefixScenarioChecks.toLocaleString()} (${pct(diagnostics.prefixScenarioChecks, diagnostics.scenarioChecks).toFixed(1)}%)`);
console.log(`  incumbent seeds               ${diagnostics.seedScenarioChecks.toLocaleString()} (${pct(diagnostics.seedScenarioChecks, diagnostics.scenarioChecks).toFixed(1)}%)`);
console.log(`  Core bounds                   ${diagnostics.coreScenarioChecks.toLocaleString()} (${pct(diagnostics.coreScenarioChecks, diagnostics.scenarioChecks).toFixed(1)}%)`);
console.log(`  pair bounds                   ${diagnostics.pairScenarioChecks.toLocaleString()} (${pct(diagnostics.pairScenarioChecks, diagnostics.scenarioChecks).toFixed(1)}%)`);
console.log(`  full triples                  ${diagnostics.tripleScenarioChecks.toLocaleString()} (${pct(diagnostics.tripleScenarioChecks, diagnostics.scenarioChecks).toFixed(1)}%)`);
console.log(`surviving pair sum builds       ${diagnostics.survivingPairSampleBuilds.toLocaleString()}`);
console.log(`candidate preparation           ${diagnostics.candidatePreparationMs.toFixed(1)} ms`);
console.log(`combinatorial target search     ${diagnostics.combinatorialSearchMs.toFixed(1)} ms`);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ elapsedMs, diagnostics }, null, 2));
}
