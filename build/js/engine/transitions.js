import { legalStats } from '../domain/rules.js';
function cloneBoard(board) {
    return {
        core: { ...board.core, emblems: board.core.emblems.map(e => ({ ...e })) },
        mid: { ...board.mid, emblems: board.mid.emblems.map(e => ({ ...e })) },
        support: { ...board.support, emblems: board.support.emblems.map(e => ({ ...e })) },
    };
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
 * TI 2026 client constraints:
 * - a stat reroll guarantees a NEW stat for each rerolled emblem;
 * - a War Banner may not contain duplicate stats.
 *
 * When no empirical outcome weights exist, the fallback is sequential-uniform over
 * currently legal candidates. That probability model is explicitly low-confidence.
 */
export function enumerateStatReroll(board, role, op, uniformFallback) {
    const banner = board[role];
    const indices = op.scope === 'one'
        ? (op.targetIndex !== undefined && banner.emblems[op.targetIndex]?.color === op.color ? [op.targetIndex] : [])
        : banner.emblems.map((e, i) => e.color === op.color ? i : -1).filter(i => i >= 0);
    if (!indices.length)
        return [];
    const targetSet = new Set(indices);
    const fixedStats = new Set(banner.emblems.filter((_, i) => !targetSet.has(i)).map(e => e.stat));
    const originalByIndex = new Map(indices.map(i => [i, banner.emblems[i].stat]));
    const pool = legalStats(op.color);
    const outcomes = [];
    const recurse = (depth, next, probability, used) => {
        if (depth >= indices.length) {
            const outcome = { board: next, probability };
            if (uniformFallback && !op.outcomeWeights)
                outcome.note = 'Sequential-uniform legal-outcome fallback.';
            outcomes.push(outcome);
            return;
        }
        const idx = indices[depth];
        const original = originalByIndex.get(idx);
        // Client rule overrides the legacy excludeCurrent field: a rerolled emblem must change.
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
    recurse(0, cloneBoard(board), 1, fixedStats);
    return outcomes;
}
export function enumerateOperation(board, role, op, uniformFallback) {
    if (op.kind === 'stat_reroll')
        return enumerateStatReroll(board, role, op, uniformFallback);
    return [];
}
//# sourceMappingURL=transitions.js.map