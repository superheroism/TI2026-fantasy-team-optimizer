import { performance } from 'node:perf_hooks';

import { defaultBoard } from '../docs/js/data/defaultState.js';
import { bannerMechanicsKey, boardMechanicsKey } from '../docs/js/engine/bannerMechanics.js';

const ROLES = ['core', 'mid', 'support'];
const iterationsArg = process.argv.find((arg) => arg.startsWith('--iterations='));
const roundsArg = process.argv.find((arg) => arg.startsWith('--rounds='));
const iterations = Math.max(1, Number(iterationsArg?.slice('--iterations='.length) ?? 250_000));
const rounds = Math.max(1, Number(roundsArg?.slice('--rounds='.length) ?? 5));
const warmupIterations = Math.min(25_000, iterations);

function legacyBannerKey(banner) {
  return JSON.stringify([
    banner.role,
    banner.expectedSeries,
    banner.emblems.map((emblem) => [
      emblem.position,
      emblem.color,
      emblem.stat,
      emblem.qualityTier,
      emblem.trait,
    ]),
  ]);
}

function legacyBoardKey(board) {
  return JSON.stringify(ROLES.map((role) => legacyBannerKey(board[role])));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

let sink = '';
function run(fn, count) {
  const start = performance.now();
  for (let i = 0; i < count; i++) sink = fn();
  return performance.now() - start;
}

function benchmark(label, fn) {
  run(fn, warmupIterations);
  const samples = Array.from({ length: rounds }, () => run(fn, iterations));
  const ms = median(samples);
  console.log(`${label.padEnd(24)} ${ms.toFixed(1).padStart(8)} ms  ${Math.round(iterations / (ms / 1000)).toLocaleString().padStart(12)} keys/s  median/${rounds}`);
  return { ms, samples };
}

const board = structuredClone(defaultBoard);
const legacyBanner = benchmark('legacy_banner_json', () => legacyBannerKey(board.mid));
const compactBanner = benchmark('compact_banner_id', () => bannerMechanicsKey(board.mid));
const legacyBoard = benchmark('legacy_board_json', () => legacyBoardKey(board));
const compactBoard = benchmark('compact_board_id', () => boardMechanicsKey(board));

if (!sink) throw new Error('identity benchmark sink unexpectedly empty');

console.log(`banner speedup: ${(legacyBanner.ms / compactBanner.ms).toFixed(2)}x`);
console.log(`board speedup:  ${(legacyBoard.ms / compactBoard.ms).toFixed(2)}x`);
