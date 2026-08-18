import { defaultBoard } from '../../docs/js/data/defaultState.js';
import { ACTION_BY_ID, cloneAction } from '../../docs/js/data/actionCatalog.js';
import { BOARD_LAYOUTS } from '../../docs/js/domain/rules.js';
import { OPTIMIZER_ROLES } from '../../docs/js/engine/optimizerHelpers.js';

const SUPPORTED_VARIANTS = new Set([
  'baseline',
  'repeat_permuted',
  'repeat_permuted_low',
  'quality_inverted',
  'quality_capped',
]);

export function expandedBoard(variant = 'baseline') {
  if (!SUPPORTED_VARIANTS.has(variant)) throw new Error(`Unknown expanded-board fixture variant: ${variant}`);

  const board = structuredClone(defaultBoard);
  board.layoutId = 'expanded_5';
  const extra = {
    core: [
      { stat: 'Stuns', qualityTier: 2, trait: 'Friendly' },
      { stat: 'Deaths', qualityTier: 4, trait: 'Unique' },
    ],
    mid: [
      { stat: 'GPM', qualityTier: 2, trait: 'Friendly' },
      { stat: 'Stuns', qualityTier: 4, trait: 'Unique' },
    ],
    support: [
      { stat: 'Stuns', qualityTier: 2, trait: 'Friendly' },
      { stat: 'Smokes Used', qualityTier: 4, trait: 'Unique' },
    ],
  };

  for (const role of OPTIMIZER_ROLES) {
    const slots = BOARD_LAYOUTS.expanded_5.roles[role];
    const firstThree = board[role].emblems.map((emblem, index) => ({
      ...emblem,
      id: `${role}-${index}`,
      position: index,
      color: slots[index].color,
    }));
    board[role].emblems = [
      ...firstThree,
      ...extra[role].map((emblem, index) => ({
        id: `${role}-${index + 3}`,
        position: index + 3,
        color: slots[index + 3].color,
        ...emblem,
      })),
    ];
  }

  if (variant === 'repeat_permuted' || variant === 'repeat_permuted_low') {
    const permutations = {
      core: [4, 3, 0, 1, 2],
      mid: [3, 1, 4, 0, 2],
      support: [4, 3, 0, 1, 2],
    };
    for (const role of OPTIMIZER_ROLES) {
      const previous = board[role].emblems.map((emblem) => ({ ...emblem }));
      board[role].emblems = permutations[role].map((source, index) => ({
        ...previous[source],
        id: `${role}-${index}`,
        position: index,
        color: BOARD_LAYOUTS.expanded_5.roles[role][index].color,
      }));
    }
  }

  const tiers =
    variant === 'quality_inverted'
      ? [5, 1, 2, 4, 3]
      : variant === 'quality_capped'
        ? [5, 5, 4, 5, 4]
        : variant === 'repeat_permuted_low'
          ? [1, 2, 1, 2, 3]
          : null;
  if (tiers) {
    for (const role of OPTIMIZER_ROLES) {
      board[role].emblems = board[role].emblems.map((emblem, index) => ({
        ...emblem,
        qualityTier: tiers[index],
      }));
    }
  }

  return board;
}

export function makeProductionSearchState(definition) {
  const menu = definition.operationIds.map((id) => {
    const operation = ACTION_BY_ID.get(id);
    if (!operation) throw new Error(`Unknown operation fixture: ${id}`);
    return cloneAction(operation);
  });

  return {
    board: expandedBoard(definition.boardVariant),
    tokensRemaining: 2,
    menu,
    menuRerollAvailable: true,
    username: `Production search ${definition.id}`,
    objective: definition.objective,
    ...(definition.targetScore ? { targetScore: definition.targetScore } : {}),
  };
}
