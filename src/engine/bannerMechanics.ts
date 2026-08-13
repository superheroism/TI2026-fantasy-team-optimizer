import type { BannerState, BoardState, Role } from '../domain/types.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];

/**
 * Canonical identity for score-relevant banner mechanics.
 * selectedTeam is intentionally excluded: free roster optimization depends on
 * banner mechanics, not the team currently highlighted in the UI.
 */
export function bannerMechanicsKey(banner: BannerState): string {
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

/** Canonical mechanics-only identity for a complete board. */
export function boardMechanicsKey(board: BoardState): string {
  return JSON.stringify(ROLES.map((role) => bannerMechanicsKey(board[role])));
}
