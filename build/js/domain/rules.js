export const LEGAL_STAT_POOLS = {
    red: ['Creep Score', 'GPM', 'Deaths', 'Tower Kills', 'Madstone', 'Kills'],
    green: ['Teamfight Participation', 'Tormentor Kills', 'Roshan Kills', 'Stuns', 'Courier Kills', 'First Blood'],
    blue: ['Runes', 'Watchers', 'Wards Placed', 'Smokes Used', 'Camps Stacked', 'Lotuses'],
};
const slots = (colors) => colors.map((color, index) => ({ index, color }));
export const BOARD_LAYOUTS = {
    legacy_3: {
        id: 'legacy_3',
        roles: {
            core: slots(['red', 'green', 'red']),
            mid: slots(['red', 'blue', 'green']),
            support: slots(['blue', 'green', 'blue']),
        },
    },
    expanded_5: {
        id: 'expanded_5',
        roles: {
            core: slots(['red', 'green', 'red', 'green', 'red']),
            mid: slots(['red', 'blue', 'green', 'red', 'green']),
            support: slots(['blue', 'green', 'blue', 'green', 'blue']),
        },
    },
};
export const RULESETS = {
    ti2026_legacy: { id: 'ti2026_legacy', boardLayout: BOARD_LAYOUTS.legacy_3 },
    ti2026_expanded: { id: 'ti2026_expanded', boardLayout: BOARD_LAYOUTS.expanded_5 },
};
export const DEFAULT_RULESET = RULESETS.ti2026_legacy;
export const DEFAULT_LAYOUT_ID = DEFAULT_RULESET.boardLayout.id;
/** Legacy compatibility alias. New code should use boardLayout(layoutId).roles[role]. */
export const BANNER_COLORS = {
    core: ['red', 'green', 'red'],
    mid: ['red', 'blue', 'green'],
    support: ['blue', 'green', 'blue'],
};
export function boardLayout(id = DEFAULT_LAYOUT_ID) { return BOARD_LAYOUTS[id]; }
export function slotDefinitions(id, role) { return BOARD_LAYOUTS[id].roles[role]; }
export function statPoolColor(color) { return color; }
export function legalStats(color) { return LEGAL_STAT_POOLS[color]; }
export function isLegalStat(color, stat) { return LEGAL_STAT_POOLS[color].includes(stat); }
//# sourceMappingURL=rules.js.map