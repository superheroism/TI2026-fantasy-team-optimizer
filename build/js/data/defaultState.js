import { BOARD_LAYOUTS, DEFAULT_LAYOUT_ID, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, cloneAction } from './actionCatalog.js';
/** Deterministic legal fallbacks for every canonical slot in both supported layouts. */
export const DEFAULT_STATS_BY_ROLE = {
    core: ['Creep Score', 'Teamfight Participation', 'GPM', 'Stuns', 'Deaths'],
    mid: ['Creep Score', 'Runes', 'Teamfight Participation', 'GPM', 'Stuns'],
    support: ['Watchers', 'Teamfight Participation', 'Wards Placed', 'Stuns', 'Smokes Used'],
};
const teamDefaults = { core: 'LGD Gaming', mid: 'Team Liquid', support: 'LGD Gaming' };
/** Product defaults for retained-series opportunity under each physical board layout. */
export const DEFAULT_EXPECTED_SERIES_BY_LAYOUT = {
    legacy_3: 5,
    expanded_5: 3,
};
function defaultEmblem(role, position, color) {
    const stat = DEFAULT_STATS_BY_ROLE[role][position];
    if (!stat || !isLegalStat(color, stat))
        throw new Error(`Missing legal default for ${role} slot ${position + 1} (${color}).`);
    return { id: `${role}-${position}`, position, color, stat, qualityTier: 3, trait: 'Fractal' };
}
export function resolvedLayoutId(board) {
    return board.layoutId ?? DEFAULT_LAYOUT_ID;
}
export function createDefaultBoard(layoutId = DEFAULT_LAYOUT_ID) {
    const layout = BOARD_LAYOUTS[layoutId];
    const roleBanner = (role) => ({
        role,
        selectedTeam: teamDefaults[role],
        expectedSeries: DEFAULT_EXPECTED_SERIES_BY_LAYOUT[layoutId],
        emblems: layout.roles[role].map(slot => defaultEmblem(role, slot.index, slot.color)),
    });
    const board = { core: roleBanner('core'), mid: roleBanner('mid'), support: roleBanner('support') };
    // Preserve the pre-M6A descriptive legacy shape while expanded boards carry explicit identity.
    if (layoutId !== 'legacy_3')
        board.layoutId = layoutId;
    return board;
}
export function convertBoardLayout(source, targetLayoutId) {
    if (resolvedLayoutId(source) === targetLayoutId)
        return structuredClone(source);
    const layout = BOARD_LAYOUTS[targetLayoutId];
    const convertRole = (role) => {
        const current = source[role];
        const emblems = layout.roles[role].map(slot => {
            const existing = current.emblems[slot.index];
            if (existing) {
                if (existing.color !== slot.color)
                    throw new Error(`Canonical color mismatch at ${role} slot ${slot.index + 1}.`);
                return structuredClone(existing);
            }
            return defaultEmblem(role, slot.index, slot.color);
        });
        return { role, selectedTeam: current.selectedTeam, expectedSeries: DEFAULT_EXPECTED_SERIES_BY_LAYOUT[targetLayoutId], emblems };
    };
    const converted = { core: convertRole('core'), mid: convertRole('mid'), support: convertRole('support') };
    if (targetLayoutId !== 'legacy_3')
        converted.layoutId = targetLayoutId;
    return converted;
}
export const defaultBoard = createDefaultBoard();
const action = (id) => cloneAction(ACTION_BY_ID.get(id));
export const defaultMenu = [action('green-stat-all'), action('red-quality-all'), action('blue-trait-all')];
//# sourceMappingURL=defaultState.js.map