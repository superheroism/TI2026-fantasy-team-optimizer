import assert from 'node:assert/strict';
import test from 'node:test';

import {
  choosePreparedTargetSearch,
  choosePreparedTargetSearchReference,
  clearTargetSearchOptimizationCaches,
  getTargetSearchDiagnostics,
  prepareTargetCandidates,
  resetTargetSearchDiagnostics,
  setTargetSearchDiagnosticsEnabled,
} from '../docs/js/engine/targetSearch.js';

const EPSILON = 1e-12;

function candidate(id, expected, samples, scale = 1) {
  return { payload: id, expected, samples, scale };
}

function prepared(groups, iterations) {
  return groups.map((group) => prepareTargetCandidates(group, iterations));
}

function assertChoiceEqual(actual, expected, label = '') {
  assert.equal(Boolean(actual), Boolean(expected), `${label} status`);
  if (!actual || !expected) return;
  assert.equal(actual.hits, expected.hits, `${label} hits`);
  assert.equal(actual.probability, expected.probability, `${label} probability`);
  assert.ok(Math.abs(actual.expected - expected.expected) <= EPSILON, `${label} expected`);
  assert.deepEqual(actual.selected, expected.selected, `${label} selected`);
  assert.deepEqual(actual.samples, expected.samples, `${label} samples`);
}

function compare(groups, target, iterations, incumbentHits = -1, incumbentExpected = -Infinity, label = '') {
  const p = prepared(groups, iterations);
  const reference = choosePreparedTargetSearchReference(p, target, iterations, incumbentHits, incumbentExpected);
  const optimized = choosePreparedTargetSearch(p, target, iterations, incumbentHits, incumbentExpected);
  assertChoiceEqual(optimized, reference, label);
  return optimized;
}

test('M5F optimized kernel preserves canonical edge cases and incumbent semantics', () => {
  const cases = [
    { label: 'empty', groups: [[], [candidate('b', 1, [1])], [candidate('c', 1, [1])]], target: 1, n: 1 },
    { label: 'singleton-boundary', groups: [[candidate('a', 1, [1, 2])], [candidate('b', 2, [2, 2])], [candidate('c', 3, [3, 2])]], target: 6, n: 2 },
    { label: 'all-hit', groups: [[candidate('a', 5, [5, 5])], [candidate('b', 5, [5, 5])], [candidate('c', 5, [5, 5])]], target: 10, n: 2 },
    { label: 'no-hit', groups: [[candidate('a', 1, [1, 1])], [candidate('b', 1, [1, 1])], [candidate('c', 1, [1, 1])]], target: 10, n: 2 },
    { label: 'dominated', groups: [[candidate('a0', 5, [5, 5]), candidate('a1', 4, [4, 4])], [candidate('b', 1, [1, 1])], [candidate('c', 1, [1, 1])]], target: 7, n: 2 },
    { label: 'same-hits-higher-expected', groups: [[candidate('a0', 5, [8, 0]), candidate('a1', 4, [8, 0])], [candidate('b', 2, [0, 8])], [candidate('c', 1, [0, 0])]], target: 8, n: 2 },
    { label: 'canonical-exact-tie', groups: [[candidate('first', 5, [7, 1]), candidate('second', 5, [7, 1])], [candidate('b', 2, [1, 7])], [candidate('c', 1, [0, 0])]], target: 8, n: 2 },
    { label: 'uneven', groups: [[candidate('a0', 4, [1, 9, 2]), candidate('a1', 3, [7, 2, 6]), candidate('a2', 2, [4, 4, 4])], [candidate('b0', 5, [1, 8, 4])], [candidate('c0', 5, [7, 0, 3]), candidate('c1', 4, [2, 9, 1]), candidate('c2', 3, [5, 5, 5]), candidate('c3', 2, [9, 1, 0])]], target: 13, n: 3 },
  ];

  for (const c of cases) {
    for (const incumbent of [[-1, -Infinity], [0, 0], [c.n, -Infinity], [c.n + 1, 1e9]]) {
      compare(c.groups, c.target, c.n, incumbent[0], incumbent[1], `${c.label}/${incumbent.join(':')}`);
    }
  }
});

test('M5F optimized kernel preserves epsilon tie behavior around incumbent expected score', () => {
  const groups = [
    [candidate('a0', 4, [4, 0]), candidate('a1', 4, [0, 4])],
    [candidate('b0', 3, [3, 3])],
    [candidate('c0', 2, [2, 2])],
  ];
  for (const delta of [-2 * EPSILON, -EPSILON, -0.5 * EPSILON, 0, 0.5 * EPSILON, EPSILON, 2 * EPSILON]) {
    compare(groups, 9, 2, 1, 9 + delta, `epsilon ${delta}`);
  }
});

test('M5F optimized kernel matches the frozen reference across deterministic adversarial generated cases', () => {
  let state = 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };

  for (let caseIndex = 0; caseIndex < 600; caseIndex++) {
    const iterations = 2 + (caseIndex % 6);
    const groups = [0, 1, 2].map((groupIndex) =>
      Array.from({ length: 1 + ((caseIndex + groupIndex) % 5) }, (_, candidateIndex) => {
        const samples = Array.from({ length: iterations }, () => Math.floor(random() * 21));
        const expected = samples.reduce((sum, value) => sum + value, 0) / iterations
          + groupIndex * 0.001 + candidateIndex * 0.00001;
        return candidate(`${caseIndex}:${groupIndex}:${candidateIndex}`, expected, samples, candidateIndex % 2 ? 1.05 : 1);
      }),
    );
    const target = Math.floor(random() * 45);
    const incumbents = [
      [-1, -Infinity],
      [0, 0],
      [Math.floor(iterations / 2), 5],
      [iterations, 15],
      [iterations + 1, 30],
    ];
    for (const [hits, expected] of incumbents) compare(groups, target, iterations, hits, expected, `generated ${caseIndex}`);
  }
});


test('M5F optimized kernel exhaustively matches the reference on a small integer sample space', () => {
  const atoms = [
    [0, 0],
    [0, 2],
    [2, 0],
    [2, 2],
  ];
  let cases = 0;
  for (let a0 = 0; a0 < atoms.length; a0++) for (let a1 = 0; a1 < atoms.length; a1++) {
    for (let b0 = 0; b0 < atoms.length; b0++) for (let b1 = 0; b1 < atoms.length; b1++) {
      for (let c0 = 0; c0 < atoms.length; c0++) for (let c1 = 0; c1 < atoms.length; c1++) {
        const indexes = [[a0, a1], [b0, b1], [c0, c1]];
        const groups = indexes.map((pair, groupIndex) => pair.map((atomIndex, candidateIndex) => {
          const samples = atoms[atomIndex];
          const expected = (samples[0] + samples[1]) / 2 + candidateIndex * 1e-14;
          return candidate(`${groupIndex}:${candidateIndex}:${atomIndex}`, expected, samples);
        }));
        for (let target = 0; target <= 6; target++) {
          compare(groups, target, 2, -1, -Infinity, `integer ${cases}/${target}`);
        }
        cases++;
      }
    }
  }
  assert.equal(cases, 4096);
});

test('M5F exact suffix bound skips a remaining third-group suffix without changing the winner', () => {
  clearTargetSearchOptimizationCaches();
  resetTargetSearchDiagnostics();
  setTargetSearchDiagnosticsEnabled(true);
  try {
    const n = 8;
    const groups = [
      [candidate('a', 100, Array(n).fill(100))],
      [candidate('b', 100, Array(n).fill(100))],
      [
        candidate('c0', 100, [100, 0, 0, 0, 0, 0, 0, 0]),
        candidate('c1', 99, [100, 100, 0, 0, 0, 0, 0, 0]),
        candidate('c2', 98, [100, 100, 10, 20, 30, 40, 0, 5]),
        candidate('c3', 97, [100, 100, 40, 0, 5, 10, 20, 30]),
        candidate('c4', 96, [100, 100, 30, 40, 0, 5, 10, 20]),
        candidate('c5', 95, [100, 100, 20, 30, 40, 0, 5, 10]),
        candidate('c6', 94, [100, 100, 10, 20, 30, 40, 0, 5]),
      ],
    ];
    const p = prepared(groups, n);
    const reference = choosePreparedTargetSearchReference(p, 250, n);
    const optimized = choosePreparedTargetSearch(p, 250, n);
    assertChoiceEqual(optimized, reference, 'suffix');
    const d = getTargetSearchDiagnostics();
    assert.ok(d.suffixBoundCalls > 0);
    assert.ok(d.suffixBoundPruned > 0);
    assert.ok(d.suffixThirdCandidatesSkipped > 0);
  } finally {
    setTargetSearchDiagnosticsEnabled(false);
  }
});

test('M5F reuses exact prepared pair samples by identity only after the pair recurs', () => {
  clearTargetSearchOptimizationCaches();
  resetTargetSearchDiagnostics();
  setTargetSearchDiagnosticsEnabled(true);
  try {
    const n = 8;
    const first = prepareTargetCandidates([candidate('a0', 6, [9,0,9,0,9,0,9,0]), candidate('a1', 5, [0,9,0,9,0,9,0,9])], n);
    const second = prepareTargetCandidates([candidate('b0', 6, [8,1,8,1,8,1,8,1]), candidate('b1', 5, [1,8,1,8,1,8,1,8])], n);
    const third = prepareTargetCandidates([candidate('c0', 3, Array(n).fill(3)), candidate('c1', 2, [0,6,0,6,0,6,0,6])], n);
    const groups = [first, second, third];
    for (let i = 0; i < 3; i++) {
      const reference = choosePreparedTargetSearchReference(groups, 12, n);
      const optimized = choosePreparedTargetSearch(groups, 12, n);
      assertChoiceEqual(optimized, reference, `pair reuse ${i}`);
    }
    const d = getTargetSearchDiagnostics();
    assert.ok(d.pairGroupCacheHits >= 2);
    assert.ok(d.pairSampleCacheBuilds > 0);
    assert.ok(d.pairSampleCacheHits > 0);
  } finally {
    setTargetSearchDiagnosticsEnabled(false);
  }
});
