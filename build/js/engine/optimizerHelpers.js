export const OPTIMIZER_ROLES = ['core', 'mid', 'support'];
export function incrementDepth(map, depth) { map.set(depth, (map.get(depth) ?? 0) + 1); }
export function depthRecord(map) {
    const out = {};
    for (const [depth, count] of map)
        out[String(depth)] = count;
    return out;
}
export function utility(evaluation, state) {
    return state.objective === 'target_probability' ? (evaluation.targetProbability ?? 0) : evaluation.expected;
}
export function formatAction(action, state) {
    if (action.kind === 'stop')
        return 'Best Current Setup';
    if (action.kind === 'menu_reroll')
        return 'Reroll operation menu';
    const label = state?.menu.find(o => o.id === action.operationId)?.label ?? action.operationId;
    return `${action.banner.toUpperCase()} → ${label}`;
}
export function weightedQuantile(points, q) {
    const clean = points.filter(x => Number.isFinite(x.value) && x.probability > 0).sort((a, b) => a.value - b.value);
    const total = clean.reduce((sum, x) => sum + x.probability, 0);
    if (total <= 0)
        return undefined;
    const target = Math.max(0, Math.min(1, q)) * total;
    let cumulative = 0;
    for (const x of clean) {
        cumulative += x.probability;
        if (cumulative >= target)
            return x.value;
    }
    return clean.at(-1)?.value;
}
export function stratifiedTransitions(outcomes, maxStrata) {
    if (maxStrata <= 0 || outcomes.length <= maxStrata)
        return [...outcomes];
    const total = outcomes.reduce((s, x) => s + x.probability, 0);
    if (total <= 0)
        return [];
    const normalized = outcomes.map(x => ({ ...x, probability: x.probability / total }));
    const selected = [];
    let cumulative = 0, index = 0;
    for (let stratum = 0; stratum < maxStrata; stratum++) {
        const target = (stratum + 0.5) / maxStrata;
        while (index < normalized.length - 1 && cumulative + normalized[index].probability < target) {
            cumulative += normalized[index].probability;
            index++;
        }
        selected.push({ ...normalized[index], probability: 1 / maxStrata });
    }
    const grouped = new Map();
    for (const x of selected) {
        const prior = grouped.get(x.nextState.id);
        if (prior)
            prior.probability += x.probability;
        else
            grouped.set(x.nextState.id, { ...x });
    }
    return [...grouped.values()];
}
//# sourceMappingURL=optimizerHelpers.js.map