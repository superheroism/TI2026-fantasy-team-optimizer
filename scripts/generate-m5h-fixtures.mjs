import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ACTION_CATALOG, ACTION_BY_ID } from '../docs/js/data/actionCatalog.js';
import { defaultBoard } from '../docs/js/data/defaultState.js';
import { enumerateEngineOperation } from '../docs/js/engine/compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from '../docs/js/engine/stateEncoding.js';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const THRESHOLDS = [50_000, 55_000, 60_000];
const ROLES = ['core', 'mid', 'support'];
const CORPORA = Object.freeze({
  calibration: { seed: 2026081501, output: 'benchmarks/m5h-target-calibration-fixtures.json' },
  holdout: { seed: 2026081502, output: 'benchmarks/m5h-target-holdout-fixtures.json' },
});
const STEP_PATTERN = [1, 1, 1, 1, 2, 2, 2, 2, 2];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function randomMenu(rng) {
  const pool = ACTION_CATALOG.map((x) => x.id);
  const selected = [];
  while (selected.length < 3) {
    const index = Math.floor(rng() * pool.length);
    selected.push(pool.splice(index, 1)[0]);
  }
  return selected;
}

function priorBoardIds() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'benchmarks/m5g-target-robustness-fixtures.json'), 'utf8'));
  return new Set(manifest.fixtures.map((x) => String(x.boardStateId)));
}

function generateOne(rng, corpus, fixtureIndex, steps, forbiddenIds, context) {
  const maxAttempts = 10_000;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let engine = boardToEngineState(defaultBoard);
    const generationPath = [];
    let failed = false;
    for (let step = 0; step < steps; step++) {
      let advanced = false;
      for (let draw = 0; draw < 100; draw++) {
        const role = pick(rng, ROLES);
        const operation = pick(rng, ACTION_CATALOG);
        const outcomes = enumerateEngineOperation(engine, role, operation, true);
        if (!outcomes.length) continue;
        const outcomeIndex = Math.floor(rng() * outcomes.length);
        const nextState = outcomes[outcomeIndex].nextState;
        generationPath.push({
          step: step + 1,
          role,
          operationId: operation.id,
          outcomeIndex,
          outcomeCount: outcomes.length,
          beforeBoardStateId: String(engine.id),
          afterBoardStateId: String(nextState.id),
        });
        engine = nextState;
        advanced = true;
        break;
      }
      if (!advanced) {
        failed = true;
        break;
      }
    }
    if (failed) continue;
    const boardStateId = String(engine.id);
    if (forbiddenIds.has(boardStateId)) continue;
    forbiddenIds.add(boardStateId);
    const id = `${corpus}-${String(fixtureIndex + 1).padStart(2, '0')}`;
    return {
      id,
      generationSeed: CORPORA[corpus].seed,
      generationAttempt: attempt,
      reachabilityClass: steps === 1 ? 'one-step' : 'two-step',
      generationPath,
      boardStateId,
      descriptiveBoard: engineStateToBoard(engine, context),
      menu: randomMenu(rng),
    };
  }
  throw new Error(`Unable to generate ${corpus} fixture ${fixtureIndex + 1}`);
}

export function generateCorpus(corpus) {
  const config = CORPORA[corpus];
  if (!config) throw new Error(`Unknown corpus: ${corpus}`);
  const rng = mulberry32(config.seed);
  const context = boardAdapterContext(defaultBoard);
  const forbiddenIds = priorBoardIds();
  const fixtures = STEP_PATTERN.map((steps, index) => generateOne(rng, corpus, index, steps, forbiddenIds, context));
  const manifest = {
    schemaVersion: 1,
    package: 'M5H Adaptive Target-Probability t=3 Precision',
    corpus,
    frozenBeforeCandidateMeasurement: true,
    seed: config.seed,
    generator: 'scripts/generate-m5h-fixtures.mjs',
    algorithm: 'Mulberry32 deterministic legal compact-transition replay; four one-step and five two-step states; rejects illegal draws, M5G board IDs, and duplicate final BoardStateIDs.',
    thresholds: THRESHOLDS,
    tokensRemaining: 10,
    menuRerollAvailable: true,
    objective: 'target_probability',
    productionHorizon: 2,
    experimentHorizon: 3,
    fixtures,
  };
  return { config, manifest };
}

export function validateManifest(manifest) {
  const context = boardAdapterContext(defaultBoard);
  const seen = new Set();
  for (const fixture of manifest.fixtures) {
    let engine = boardToEngineState(defaultBoard);
    for (const mutation of fixture.generationPath) {
      if (String(engine.id) !== mutation.beforeBoardStateId) throw new Error(`${fixture.id}: before BoardStateID mismatch`);
      const operation = ACTION_BY_ID.get(mutation.operationId);
      if (!operation) throw new Error(`${fixture.id}: unknown operation ${mutation.operationId}`);
      const outcomes = enumerateEngineOperation(engine, mutation.role, operation, true);
      if (outcomes.length !== mutation.outcomeCount) throw new Error(`${fixture.id}: outcome-count mismatch`);
      const outcome = outcomes[mutation.outcomeIndex];
      if (!outcome) throw new Error(`${fixture.id}: missing outcome ${mutation.outcomeIndex}`);
      if (String(outcome.nextState.id) !== mutation.afterBoardStateId) throw new Error(`${fixture.id}: after BoardStateID mismatch`);
      engine = outcome.nextState;
    }
    if (String(engine.id) !== fixture.boardStateId) throw new Error(`${fixture.id}: final BoardStateID mismatch`);
    if (seen.has(fixture.boardStateId)) throw new Error(`${fixture.id}: duplicate BoardStateID`);
    seen.add(fixture.boardStateId);
    const reconstructed = engineStateToBoard(engine, context);
    if (JSON.stringify(reconstructed) !== JSON.stringify(fixture.descriptiveBoard)) throw new Error(`${fixture.id}: descriptive board reconstruction mismatch`);
    if (fixture.menu.length !== 3 || new Set(fixture.menu).size !== 3) throw new Error(`${fixture.id}: invalid menu`);
    for (const operationId of fixture.menu) if (!ACTION_BY_ID.has(operationId)) throw new Error(`${fixture.id}: unknown menu operation ${operationId}`);
  }
  return true;
}

function main() {
  const requested = process.argv.slice(2).filter((x) => !x.startsWith('--'));
  const corpora = requested.length ? requested : Object.keys(CORPORA);
  const checkOnly = process.argv.includes('--check');
  const summary = [];
  for (const corpus of corpora) {
    const { config, manifest } = generateCorpus(corpus);
    validateManifest(manifest);
    const outputPath = path.join(root, config.output);
    if (checkOnly) {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      if (JSON.stringify(existing) !== JSON.stringify(manifest)) throw new Error(`${corpus}: committed manifest differs from deterministic regeneration`);
    } else {
      fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    summary.push({ corpus, seed: config.seed, fixtures: manifest.fixtures.length, output: config.output, checkOnly });
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
