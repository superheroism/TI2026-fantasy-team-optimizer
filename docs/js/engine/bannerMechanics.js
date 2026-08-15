import { DEFAULT_LAYOUT_ID } from '../domain/rules.js';
import { encodeBannerState, encodeBoardState } from './stateEncoding.js';
/**
 * Canonical identity for score-relevant banner mechanics.
 * Layout is explicit because a banner ID is only meaningful inside a layout/role namespace.
 */
export function bannerMechanicsKey(banner, layoutId = DEFAULT_LAYOUT_ID) {
    return `${layoutId}:${banner.role}:${encodeBannerState(banner, layoutId)}:${banner.expectedSeries}`;
}
/** Canonical mechanics/scoring-context identity for a complete board. */
export function boardMechanicsKey(board) {
    return `${board.layoutId ?? DEFAULT_LAYOUT_ID}:${encodeBoardState(board)}:${board.core.expectedSeries},${board.mid.expectedSeries},${board.support.expectedSeries}`;
}
//# sourceMappingURL=bannerMechanics.js.map