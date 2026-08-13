import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseTargetSearch } from '../docs/js/engine/targetSearch.js';

const EPSILON = 1e-12;

function scaled(candidate, n) {
  const scale = candidate.scale ?? 1;
  return {
    payload: candidate.payload,
    expected: candidate.expected * scale,
    samples: Array.from({ length: n }, (_, i) =>
      (candidate.samples[i] ?? candidate.expected) * scale),
  };
}

function exhaustive(groups, targetScore, iterations) {
  const n = Math.max(1, iterations);
  const prepared = groups.map((group) => group.map((candidate) => scaled(candidate, n)));
  let best;

  for (const a of prepared[0]) {
    for (const b of prepared[1]) {
      for (const c of prepared[2]) {
        const samples = Array.from({ length: n }, (_, i) =>
          a.samples[i] + b.samples[i] + c.samples[i]);
        const hits = samples.filter((value) => value >= targetScore).length;
        const expected = a.expected + b.expected + c.expected;

        if (
          !best
          || hits > best.hits
          || (hits === best.hits && expected > best.expected + EPSILON)
        ) {
          best = {
            hits,
            probability: hits / n,
            expected,
            selected: [a.payload, b.payload, c.payload],
            samples,
          };
        }
      }
    }
  }

  return best;
}

function candidate(id, expected, samples, scale = 1) {
  return { payload: id, expected, samples, scale };
}

test('generic target search matches exhaustive enumeration with dominance and scaling', () => {
  const groups = [
    [
      candidate('A0', 13, [8, 15, 12, 17, 9, 14], 1.1),
      candidate('A1', 11, [7, 13, 10, 15, 8, 12], 1.1),
      candidate('A2', 14, [18, 5, 18, 5, 18, 5]),
    ],
    [
      candidate('B0', 10, [10, 10, 10, 10, 10, 10]),
      candidate('B1', 9, [4, 16, 4, 16, 4, 16]),
    ],
    [
      candidate('C0', 12, [12, 8, 12, 8, 12, 8]),
      candidate('C1', 11, [6, 15, 6, 15, 6, 15]),
      candidate('C2', 8, [5, 5, 5, 5, 5, 5]),
    ],
  ];

  const expected = exhaustive(groups, 37, 6);
  const actual = chooseTargetSearch(groups, 37, 6);

  assert.deepEqual(actual, expected);
});

test('generic target search matches exhaustive enumeration across deterministic generated cases', () => {
  let state = 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };

  for (let caseIndex = 0; caseIndex < 80; caseIndex++) {
    const iterations = 5 + (caseIndex % 5);
    const groups = [0, 1, 2].map((groupIndex) =>
      Array.from({ length: 2 + ((caseIndex + groupIndex) % 3) }, (_, candidateIndex) => {
        const samples = Array.from({ length: iterations }, () =>
          Math.floor(random() * 31));
        const mean = samples.reduce((sum, value) => sum + value, 0) / iterations;
        return candidate(
          `${caseIndex}:${groupIndex}:${candidateIndex}`,
          mean + groupIndex * 0.001 + candidateIndex * 0.00001,
          samples,
          candidateIndex % 2 ? 1.05 : 1,
        );
      }),
    );
    const targetScore = 25 + Math.floor(random() * 45);

    const expected = exhaustive(groups, targetScore, iterations);
    const actual = chooseTargetSearch(groups, targetScore, iterations);

    assert.equal(actual?.hits, expected?.hits, `hits case ${caseIndex}`);
    assert.equal(actual?.probability, expected?.probability, `probability case ${caseIndex}`);
    assert.ok(
      Math.abs((actual?.expected ?? 0) - (expected?.expected ?? 0)) <= EPSILON,
      `expected case ${caseIndex}`,
    );
    assert.deepEqual(actual?.selected, expected?.selected, `selection case ${caseIndex}`);
    assert.deepEqual(actual?.samples, expected?.samples, `samples case ${caseIndex}`);
  }
});
