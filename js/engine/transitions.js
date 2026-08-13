import { legalStats } from '../domain/rules.js';
const QUALITY_TIERS = [1, 2, 3, 4, 5];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
function cloneBoard(board) {
    return {
        core: { ...board.core, emblems: board.core.emblems.map(e => ({ ...e })) },
        mid: { ...board.mid, emblems: board.mid.emblems.map(e => ({ ...e })) },
        support: { ...board.support, emblems: board.support.emblems.map(e => ({ ...e })) },
    };
}
function aggregate(outcomes) {
    const grouped = new Map();
    for (const outcome of outcomes) {
        const key = JSON.stringify(outcome.board);
        const prior = grouped.get(key);
        if (prior)
            prior.probability += outcome.probability;
        else
            grouped.set(key, { ...outcome });
    }
    return [...grouped.values()].filter(x => x.probability > 0);
}
function matchingIndices(board, role, color) {
    return board[role].emblems.map((e, i) => e.color === color ? i : -1).filter(i => i >= 0);
}
function targetChoices(matching, scope) {
    if (!matching.length)
        return [];
    if (scope === 'all_matching')
        return [{ indices: matching, probability: 1 }];
    if (scope === 'first_matching')
        return [{ indices: [matching[0]], probability: 1 }];
    if (scope === 'last_matching')
        return [{ indices: [matching[matching.length - 1]], probability: 1 }];
    return matching.map(i => ({ indices: [i], probability: 1 / matching.length, note: `Random target: slot ${i + 1}.` }));
}
function weightedCandidates(op, candidates, uniformFallback) {
    if (op.outcomeWeights) {
        const weighted = candidates
            .map(s => [s, Math.max(0, op.outcomeWeights?.[s] ?? 0)])
            .filter(x => x[1] > 0);
        if (weighted.length)
            return weighted;
    }
    if (!uniformFallback)
        return [];
    return candidates.map(s => [s, 1]);
}
/**
 * Client constraints:
 * - every rerolled stat must change;
 * - no duplicate stats may exist on a War Banner;
 * - V1 assumes uniform selection from the currently legal replacement set.
 *
 * For multi-emblem rerolls, legal replacements are sampled sequentially without
 * replacement because each final War Banner must also satisfy the no-duplicate rule.
 */
export function enumerateStatReroll(board, role, op, uniformFallback = true) {
    const banner = board[role];
    const matching = matchingIndices(board, role, op.color);
    if (!matching.length)
        return [];
    const allOutcomes = [];
    for (const choice of targetChoices(matching, op.scope)) {
        const indices = choice.indices;
        const targetSet = new Set(indices);
        const fixedStats = new Set(banner.emblems.filter((_, i) => !targetSet.has(i)).map(e => e.stat));
        const originalByIndex = new Map(indices.map(i => [i, banner.emblems[i].stat]));
        const pool = legalStats(op.color);
        const recurse = (depth, next, probability, used) => {
            if (depth >= indices.length) {
                const outcome = { board: next, probability };
                if (choice.note)
                    outcome.note = choice.note;
                allOutcomes.push(outcome);
                return;
            }
            const idx = indices[depth];
            const original = originalByIndex.get(idx);
            const candidates = pool.filter(stat => stat !== original && !used.has(stat));
            const weighted = weightedCandidates(op, candidates, uniformFallback);
            const totalWeight = weighted.reduce((s, x) => s + x[1], 0);
            if (totalWeight <= 0)
                return;
            for (const [stat, weight] of weighted) {
                const copy = cloneBoard(next);
                copy[role].emblems[idx] = { ...copy[role].emblems[idx], stat };
                const nextUsed = new Set(used);
                nextUsed.add(stat);
                recurse(depth + 1, copy, probability * weight / totalWeight, nextUsed);
            }
        };
        recurse(0, cloneBoard(board), choice.probability, fixedStats);
    }
    return aggregate(allOutcomes);
}
/** Ordinary quality reroll: each targeted tier must change and is uniform over the other four tiers. */
export function enumerateQualityReroll(board, role, op) {
    if (op.kind !== 'quality_reroll')
        return [];
    const choices = targetChoices(matchingIndices(board, role, op.color), op.scope);
    const out = [];
    for (const choice of choices) {
        const recurse = (depth, next, p) => {
            if (depth >= choice.indices.length) {
                const outcome = { board: next, probability: p };
                if (choice.note)
                    outcome.note = choice.note;
                out.push(outcome);
                return;
            }
            const idx = choice.indices[depth];
            const current = next[role].emblems[idx].qualityTier;
            const candidates = QUALITY_TIERS.filter(t => t !== current);
            for (const tier of candidates) {
                const copy = cloneBoard(next);
                copy[role].emblems[idx] = { ...copy[role].emblems[idx], qualityTier: tier };
                recurse(depth + 1, copy, p / candidates.length);
            }
        };
        recurse(0, cloneBoard(board), choice.probability);
    }
    return aggregate(out);
}
/** Trait reroll: each targeted trait must change and is uniform over the other four traits. */
export function enumerateTraitReroll(board, role, op) {
    if (op.kind !== 'trait_reroll')
        return [];
    const choices = targetChoices(matchingIndices(board, role, op.color), op.scope);
    const out = [];
    for (const choice of choices) {
        const recurse = (depth, next, p) => {
            if (depth >= choice.indices.length) {
                const outcome = { board: next, probability: p };
                if (choice.note)
                    outcome.note = choice.note;
                out.push(outcome);
                return;
            }
            const idx = choice.indices[depth];
            const current = next[role].emblems[idx].trait;
            const candidates = TRAITS.filter(t => t !== current);
            for (const trait of candidates) {
                const copy = cloneBoard(next);
                copy[role].emblems[idx] = { ...copy[role].emblems[idx], trait };
                recurse(depth + 1, copy, p / candidates.length);
            }
        };
        recurse(0, cloneBoard(board), choice.probability);
    }
    return aggregate(out);
}
function directionalTiers(current, direction) {
    return QUALITY_TIERS.filter(t => direction === 'increase' ? t > current : t < current);
}
function directionalTierOutcomes(current, direction) {
    const candidates = directionalTiers(current, direction);
    // A random directional action may land on a capped/floored emblem. In that case
    // there is no legal directional destination and the selected emblem is unchanged.
    if (!candidates.length)
        return [{ tier: current, probability: 1 }];
    return candidates.map(tier => ({ tier, probability: 1 / candidates.length }));
}
/** Randomly choose one of the banner's three emblems, then increase uniformly to any higher tier. */
export function enumerateQualityIncrease(board, role, op) {
    if (op.kind !== 'quality_increase')
        return [];
    const out = [];
    for (const idx of [0, 1, 2]) {
        const current = board[role].emblems[idx].qualityTier;
        for (const x of directionalTierOutcomes(current, 'increase')) {
            const copy = cloneBoard(board);
            copy[role].emblems[idx] = { ...copy[role].emblems[idx], qualityTier: x.tier };
            out.push({ board: copy, probability: (1 / 3) * x.probability, note: `Randomly selected slot ${idx + 1} to increase.` });
        }
    }
    return aggregate(out);
}
/**
 * Randomly choose one of the three banner slots to decrease; the other two increase.
 * Each directional tier change is uniform across every tier strictly above/below the
 * current tier. Boundary selections (Tier V upward or Tier I downward) are cap/floor waste.
 */
export function enumerateQualityRedistribution(board, role, op) {
    if (op.kind !== 'quality_redistribution')
        return [];
    const out = [];
    for (const downIdx of [0, 1, 2]) {
        const directions = ['increase', 'increase', 'increase'];
        directions[downIdx] = 'decrease';
        const recurse = (idx, next, p) => {
            if (idx >= 3) {
                out.push({ board: next, probability: p, note: `Randomly selected slot ${downIdx + 1} to decrease; the other two increase.` });
                return;
            }
            const pos = idx, current = next[role].emblems[pos].qualityTier;
            const possibilities = directionalTierOutcomes(current, directions[pos]);
            for (const x of possibilities) {
                const copy = cloneBoard(next);
                copy[role].emblems[pos] = { ...copy[role].emblems[pos], qualityTier: x.tier };
                recurse(idx + 1, copy, p * x.probability);
            }
        };
        recurse(0, cloneBoard(board), 1 / 3);
    }
    return aggregate(out);
}
export function enumerateOperation(board, role, op, uniformFallback = true) {
    if (op.kind === 'stat_reroll')
        return enumerateStatReroll(board, role, op, uniformFallback);
    if (op.kind === 'quality_reroll')
        return enumerateQualityReroll(board, role, op);
    if (op.kind === 'trait_reroll')
        return enumerateTraitReroll(board, role, op);
    if (op.kind === 'quality_increase')
        return enumerateQualityIncrease(board, role, op);
    if (op.kind === 'quality_redistribution')
        return enumerateQualityRedistribution(board, role, op);
    return [];
}
//# sourceMappingURL=transitions.js.map