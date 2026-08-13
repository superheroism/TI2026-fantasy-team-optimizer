import { BANNER_COLORS, LEGAL_STAT_POOLS } from '../domain/rules.js';
export const TRAIT_ORDER = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
export const QUALITY_COUNT = 5;
export const TRAIT_COUNT = TRAIT_ORDER.length;
export const STATS_PER_COLOR = 6;
export const EMBLEM_STATE_COUNT = STATS_PER_COLOR * QUALITY_COUNT * TRAIT_COUNT;
export const BANNER_STATE_COUNT = EMBLEM_STATE_COUNT ** 3;
const BOARD_RADIX = BigInt(BANNER_STATE_COUNT);
function integerInRange(value, min, max, label) {
    if (!Number.isInteger(value) || value < min || value > max)
        throw new RangeError(`${label} must be an integer in [${min}, ${max}], got ${value}.`);
}
function assertSlot(role, position, emblem) {
    if (emblem.position !== position)
        throw new Error(`Expected ${role} slot ${position} position ${position}, got ${emblem.position}.`);
    const color = BANNER_COLORS[role][position];
    if (emblem.color !== color)
        throw new Error(`Expected ${role} slot ${position} color ${color}, got ${emblem.color}.`);
}
export function encodeEmblemState(role, position, emblem) {
    assertSlot(role, position, emblem);
    const pool = LEGAL_STAT_POOLS[emblem.color];
    const statIndex = pool.indexOf(emblem.stat);
    if (statIndex < 0)
        throw new Error(`${emblem.stat} is not legal for ${emblem.color} slot ${role}/${position}.`);
    const traitIndex = TRAIT_ORDER.indexOf(emblem.trait);
    if (traitIndex < 0)
        throw new Error(`Unknown trait ${emblem.trait}.`);
    integerInRange(emblem.qualityTier, 1, 5, 'qualityTier');
    return ((statIndex * QUALITY_COUNT + (emblem.qualityTier - 1)) * TRAIT_COUNT) + traitIndex;
}
export function decodeEmblemState(role, position, id) {
    integerInRange(id, 0, EMBLEM_STATE_COUNT - 1, 'emblem state ID');
    const traitIndex = id % TRAIT_COUNT;
    const qualityIndex = Math.floor(id / TRAIT_COUNT) % QUALITY_COUNT;
    const statIndex = Math.floor(id / (TRAIT_COUNT * QUALITY_COUNT));
    const color = BANNER_COLORS[role][position];
    return {
        id: `${role}-${position}`,
        position,
        color,
        stat: LEGAL_STAT_POOLS[color][statIndex],
        qualityTier: (qualityIndex + 1),
        trait: TRAIT_ORDER[traitIndex],
    };
}
/** Role-local ID containing only reroll-variable banner mechanics. */
export function encodeBannerState(banner) {
    const e0 = encodeEmblemState(banner.role, 0, banner.emblems[0]);
    const e1 = encodeEmblemState(banner.role, 1, banner.emblems[1]);
    const e2 = encodeEmblemState(banner.role, 2, banner.emblems[2]);
    return e0 + EMBLEM_STATE_COUNT * (e1 + EMBLEM_STATE_COUNT * e2);
}
export function decodeBannerState(role, id, context) {
    integerInRange(id, 0, BANNER_STATE_COUNT - 1, 'banner state ID');
    let config = id;
    const e0 = config % EMBLEM_STATE_COUNT;
    config = Math.floor(config / EMBLEM_STATE_COUNT);
    const e1 = config % EMBLEM_STATE_COUNT;
    config = Math.floor(config / EMBLEM_STATE_COUNT);
    const e2 = config;
    return {
        role,
        selectedTeam: context.selectedTeam,
        expectedSeries: context.expectedSeries,
        emblems: [decodeEmblemState(role, 0, e0), decodeEmblemState(role, 1, e1), decodeEmblemState(role, 2, e2)],
    };
}
export function encodeBoardStateIds(core, mid, support) {
    for (const [role, id] of [['core', core], ['mid', mid], ['support', support]])
        integerInRange(id, 0, BANNER_STATE_COUNT - 1, `${role} banner state ID`);
    return BigInt(core) + BOARD_RADIX * (BigInt(mid) + BOARD_RADIX * BigInt(support));
}
export function decodeBoardStateId(id) {
    if (id < 0n || id >= BOARD_RADIX ** 3n)
        throw new RangeError(`board state ID is outside the canonical range: ${id}.`);
    let value = id;
    const core = Number(value % BOARD_RADIX);
    value /= BOARD_RADIX;
    const mid = Number(value % BOARD_RADIX);
    value /= BOARD_RADIX;
    const support = Number(value);
    return [core, mid, support];
}
export function boardAdapterContext(board) {
    return {
        core: { selectedTeam: board.core.selectedTeam, expectedSeries: board.core.expectedSeries },
        mid: { selectedTeam: board.mid.selectedTeam, expectedSeries: board.mid.expectedSeries },
        support: { selectedTeam: board.support.selectedTeam, expectedSeries: board.support.expectedSeries },
    };
}
export function encodeBoardState(board) {
    return encodeBoardStateIds(encodeBannerState(board.core), encodeBannerState(board.mid), encodeBannerState(board.support));
}
export function boardToEngineState(board) {
    const core = encodeBannerState(board.core), mid = encodeBannerState(board.mid), support = encodeBannerState(board.support);
    return { core, mid, support, id: encodeBoardStateIds(core, mid, support) };
}
export function engineStateToBoard(state, context) {
    const decoded = decodeBoardStateId(state.id);
    if (decoded[0] !== state.core || decoded[1] !== state.mid || decoded[2] !== state.support)
        throw new Error('EngineState banner IDs do not match its board ID.');
    return {
        core: decodeBannerState('core', state.core, context.core),
        mid: decodeBannerState('mid', state.mid, context.mid),
        support: decodeBannerState('support', state.support, context.support),
    };
}
//# sourceMappingURL=stateEncoding.js.map