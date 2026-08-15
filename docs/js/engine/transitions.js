import { legalStats } from '../domain/rules.js';
const QUALITY_TIERS = [1, 2, 3, 4, 5];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
function cloneBoard(board) {
    const out = {
        core: { ...board.core, emblems: board.core.emblems.map(e => ({ ...e })) },
        mid: { ...board.mid, emblems: board.mid.emblems.map(e => ({ ...e })) },
        support: { ...board.support, emblems: board.support.emblems.map(e => ({ ...e })) },
    };
    if (board.layoutId)
        out.layoutId = board.layoutId;
    return out;
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
    if (!candidates.length)
        return [{ tier: current, probability: 1 }];
    return candidates.map(tier => ({ tier, probability: 1 / candidates.length }));
}
/** Randomly choose one emblem from the complete layout-defined banner, then increase uniformly to any higher tier. */
export function enumerateQualityIncrease(board, role, op) {
    if (op.kind !== 'quality_increase')
        return [];
    const out = [], count = board[role].emblems.length;
    for (let idx = 0; idx < count; idx++) {
        const current = board[role].emblems[idx].qualityTier;
        for (const x of directionalTierOutcomes(current, 'increase')) {
            const copy = cloneBoard(board);
            copy[role].emblems[idx] = { ...copy[role].emblems[idx], qualityTier: x.tier };
            out.push({ board: copy, probability: (1 / count) * x.probability, note: `Randomly selected slot ${idx + 1} to increase.` });
        }
    }
    return aggregate(out);
}
function choosePairs(indices) {
    const pairs = [];
    for (let i = 0; i < indices.length; i++)
        for (let j = i + 1; j < indices.length; j++)
            pairs.push([indices[i], indices[j]]);
    return pairs;
}
/** Randomly choose one slot to decrease and two distinct remaining slots to increase. */
export function enumerateQualityRedistribution(board, role, op) {
    if (op.kind !== 'quality_redistribution')
        return [];
    const count = board[role].emblems.length;
    if (count < 3)
        return [];
    const out = [];
    for (let downIdx = 0; downIdx < count; downIdx++) {
        const remaining = Array.from({ length: count }, (_, i) => i).filter(i => i !== downIdx);
        const recipientPairs = choosePairs(remaining);
        for (const recipients of recipientPairs) {
            const recipientSet = new Set(recipients);
            const recurse = (idx, next, p) => {
                if (idx >= count) {
                    out.push({ board: next, probability: p, note: `Randomly selected slot ${downIdx + 1} to decrease; slots ${recipients[0] + 1} and ${recipients[1] + 1} increase.` });
                    return;
                }
                const current = next[role].emblems[idx].qualityTier;
                const direction = idx === downIdx ? 'decrease' : recipientSet.has(idx) ? 'increase' : null;
                if (!direction) {
                    recurse(idx + 1, next, p);
                    return;
                }
                for (const x of directionalTierOutcomes(current, direction)) {
                    const copy = cloneBoard(next);
                    copy[role].emblems[idx] = { ...copy[role].emblems[idx], qualityTier: x.tier };
                    recurse(idx + 1, copy, p * x.probability);
                }
            };
            recurse(0, cloneBoard(board), (1 / count) * (1 / recipientPairs.length));
        }
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