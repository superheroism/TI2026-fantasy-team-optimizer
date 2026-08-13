const ROLES = ['core', 'mid', 'support'];
/**
 * Canonical identity for score-relevant banner mechanics.
 * selectedTeam is intentionally excluded: free roster optimization depends on
 * banner mechanics, not the team currently highlighted in the UI.
 */
export function bannerMechanicsKey(banner) {
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
export function boardMechanicsKey(board) {
    return JSON.stringify(ROLES.map((role) => bannerMechanicsKey(board[role])));
}
//# sourceMappingURL=bannerMechanics.js.map