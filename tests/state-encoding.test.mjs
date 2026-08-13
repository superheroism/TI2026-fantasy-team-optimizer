import assert from 'node:assert/strict';
import test from 'node:test';

import { BANNER_COLORS, LEGAL_STAT_POOLS } from '../docs/js/domain/rules.js';
import {
  BANNER_STATE_COUNT,
  EMBLEM_STATE_COUNT,
  TRAIT_ORDER,
  boardAdapterContext,
  boardToEngineState,
  decodeBannerState,
  decodeBoardStateId,
  decodeEmblemState,
  encodeBannerState,
  encodeBoardStateIds,
  encodeEmblemState,
  engineStateToBoard,
} from '../docs/js/engine/stateEncoding.js';
import { bannerMechanicsKey, boardMechanicsKey } from '../docs/js/engine/bannerMechanics.js';

const ROLES = ['core', 'mid', 'support'];

function emblem(role, position, statIndex, qualityIndex, traitIndex) {
  const color = BANNER_COLORS[role][position];
  return {
    id: `${role}-${position}`,
    position,
    color,
    stat: LEGAL_STAT_POOLS[color][statIndex],
    qualityTier: qualityIndex + 1,
    trait: TRAIT_ORDER[traitIndex],
  };
}

test('every slot-valid emblem state has a collision-free canonical ID and exact round trip', () => {
  for (const role of ROLES) {
    for (const position of [0, 1, 2]) {
      let expectedId = 0;
      for (let statIndex = 0; statIndex < 6; statIndex++) {
        for (let qualityIndex = 0; qualityIndex < 5; qualityIndex++) {
          for (let traitIndex = 0; traitIndex < 5; traitIndex++) {
            const source = emblem(role, position, statIndex, qualityIndex, traitIndex);
            const id = encodeEmblemState(role, position, source);
            assert.equal(id, expectedId++);
            assert.deepEqual(decodeEmblemState(role, position, id), source);
          }
        }
      }
      assert.equal(expectedId, EMBLEM_STATE_COUNT);
    }
  }
});

test('every encodable three-emblem banner configuration is collision-free and round-trips for each role', () => {
  for (const role of ROLES) {
    let expectedConfigId = 0;
    const context = { selectedTeam: 'Round Trip', expectedSeries: 5 };
    for (let e2 = 0; e2 < EMBLEM_STATE_COUNT; e2++) {
      for (let e1 = 0; e1 < EMBLEM_STATE_COUNT; e1++) {
        for (let e0 = 0; e0 < EMBLEM_STATE_COUNT; e0++) {
          const banner = {
            role,
            ...context,
            emblems: [
              decodeEmblemState(role, 0, e0),
              decodeEmblemState(role, 1, e1),
              decodeEmblemState(role, 2, e2),
            ],
          };
          const id = encodeBannerState(banner);
          assert.equal(id, expectedConfigId++);
          assert.equal(encodeBannerState(decodeBannerState(role, id, context)), id);
        }
      }
    }
    assert.equal(expectedConfigId, BANNER_STATE_COUNT);
  }
});

test('role-local IDs are separated by shared cache keys and scoring context', () => {
  const coreContext = { selectedTeam: 'Team', expectedSeries: 5 };
  const midContext = { selectedTeam: 'Team', expectedSeries: 5 };
  const core = decodeBannerState('core', 0, coreContext);
  const mid = decodeBannerState('mid', 0, midContext);
  assert.equal(encodeBannerState(core), encodeBannerState(mid));
  assert.notEqual(bannerMechanicsKey(core), bannerMechanicsKey(mid));

  const moreSeries = { ...core, expectedSeries: core.expectedSeries + 1 };
  assert.equal(encodeBannerState(moreSeries), encodeBannerState(core));
  assert.notEqual(bannerMechanicsKey(moreSeries), bannerMechanicsKey(core));
});

test('board IDs use disjoint role radices and round-trip at boundaries', () => {
  const cases = [
    [0, 0, 0],
    [BANNER_STATE_COUNT - 1, 0, 0],
    [0, BANNER_STATE_COUNT - 1, 0],
    [0, 0, BANNER_STATE_COUNT - 1],
    [123456, 234567, 345678],
    [BANNER_STATE_COUNT - 1, BANNER_STATE_COUNT - 1, BANNER_STATE_COUNT - 1],
  ];
  for (const ids of cases) {
    assert.deepEqual([...decodeBoardStateId(encodeBoardStateIds(...ids))], ids);
  }
});

test('BoardState adapters round-trip exactly with explicit non-transition context', async () => {
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const board = structuredClone(defaultBoard);
  const context = boardAdapterContext(board);
  const engine = boardToEngineState(board);
  assert.deepEqual(engineStateToBoard(engine, context), board);

  const contextOnlyChange = structuredClone(board);
  contextOnlyChange.core.selectedTeam += '-other';
  contextOnlyChange.mid.expectedSeries += 1;
  assert.deepEqual(boardToEngineState(contextOnlyChange), engine);
  assert.notEqual(boardMechanicsKey(contextOnlyChange), boardMechanicsKey(board));
});

test('adapter rejects non-canonical immutable slot properties and illegal stat/color combinations', async () => {
  const { defaultBoard } = await import('../docs/js/data/defaultState.js');
  const badColor = structuredClone(defaultBoard);
  badColor.core.emblems[0].color = 'blue';
  assert.throws(() => boardToEngineState(badColor), /Expected core slot 0 color red/);

  const badPosition = structuredClone(defaultBoard);
  badPosition.mid.emblems[2].position = 1;
  assert.throws(() => boardToEngineState(badPosition), /Expected mid slot 2 position 2/);
});
