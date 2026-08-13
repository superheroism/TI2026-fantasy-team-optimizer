import { encodeBannerState, encodeBoardState } from './stateEncoding.js';
/**
 * Canonical identity for score-relevant banner mechanics.
 * The compact banner ID is role-local and excludes fixed scoring context, so
 * shared scoring caches add role + expectedSeries here. Free roster selection
 * remains intentionally excluded.
 */
export function bannerMechanicsKey(banner) {
    return `${banner.role}:${encodeBannerState(banner)}:${banner.expectedSeries}`;
}
/** Canonical mechanics/scoring-context identity for a complete board. */
export function boardMechanicsKey(board) {
    return `${encodeBoardState(board)}:${board.core.expectedSeries},${board.mid.expectedSeries},${board.support.expectedSeries}`;
}
//# sourceMappingURL=bannerMechanics.js.map