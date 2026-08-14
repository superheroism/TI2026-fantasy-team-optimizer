function normalizedCap(value) { return Math.max(0, Math.floor(value)); }
export const ACTION_WIDENING_PRESETS = Object.freeze({
    wide: { id: 'wide', description: 'Deepen the top 12, then 8, then 4 shallow-ranked legal operations.', deepOperationCapsByDepth: [12, 8, 4] },
    medium: { id: 'medium', description: 'Deepen the top 8, then 5, then 3 shallow-ranked legal operations.', deepOperationCapsByDepth: [8, 5, 3] },
    narrow: { id: 'narrow', description: 'Deepen the top 5, then 3, then 2 shallow-ranked legal operations.', deepOperationCapsByDepth: [5, 3, 2] },
});
export function resolveDeepOperationCap(policy, recursiveDepth) {
    const schedule = policy.deepOperationCapsByDepth;
    if (!schedule.length)
        return 0;
    const index = Math.max(0, Math.min(Math.max(1, Math.floor(recursiveDepth)) - 1, schedule.length - 1));
    return normalizedCap(schedule[index] ?? 0);
}
export function isLegalOperationUtility(value) { return value !== -Infinity && !Number.isNaN(value); }
export function rankOperationUtilities(values) { return [...values].sort((a, b) => { if (b.value !== a.value)
    return b.value - a.value; if (a.id === b.id)
    return 0; return a.id < b.id ? -1 : 1; }); }
export function selectDeepOperationIds(policy, recursiveDepth, shallowValues) { const ranked = rankOperationUtilities(shallowValues).filter(row => isLegalOperationUtility(row.value)); const count = Math.min(resolveDeepOperationCap(policy, recursiveDepth), ranked.length); return new Set(ranked.slice(0, count).map(row => row.id)); }
function medianFromHistogram(histogram, count) { if (!count)
    return 0; const targetA = Math.floor((count - 1) / 2), targetB = Math.floor(count / 2); let seen = 0, a = 0, b = 0; for (const [value, n] of [...histogram].sort((x, y) => x[0] - y[0])) {
    const next = seen + n;
    if (seen <= targetA && targetA < next)
        a = value;
    if (seen <= targetB && targetB < next) {
        b = value;
        break;
    }
    seen = next;
} return (a + b) / 2; }
export function createActionWideningTracker(policy) {
    const byDepth = new Map();
    const record = (recursiveDepth, considered, legal, deep) => { if (!policy)
        return; let row = byDepth.get(recursiveDepth); if (!row) {
        row = { states: 0, considered: 0, legal: 0, shallow: 0, deep: 0, avoided: 0, configuredK: resolveDeepOperationCap(policy, recursiveDepth), deepHistogram: new Map() };
        byDepth.set(recursiveDepth, row);
    } row.states++; row.considered += considered; row.legal += legal; row.shallow += considered; row.deep += deep; row.avoided += Math.max(0, legal - deep); row.deepHistogram.set(deep, (row.deepHistogram.get(deep) ?? 0) + 1); };
    const report = () => { const rows = [...byDepth].sort((a, b) => a[0] - b[0]).map(([recursiveDepth, row]) => ({ recursiveDepth, freshMenuStatesWidened: row.states, operationIdentitiesConsidered: row.considered, legalOperationIdentitiesConsidered: row.legal, shallowOperationEvaluations: row.shallow, recursivelyDeepenedOperationEvaluations: row.deep, operationEvaluationsAvoided: row.avoided, configuredK: row.configuredK, meanActualDeepenedOperations: row.states ? row.deep / row.states : 0, medianActualDeepenedOperations: medianFromHistogram(row.deepHistogram, row.states), wideningAvoidanceRate: row.legal ? 1 - row.deep / row.legal : 0 })); const total = (key) => rows.reduce((sum, row) => sum + row[key], 0); const legal = total('legalOperationIdentitiesConsidered'), deep = total('recursivelyDeepenedOperationEvaluations'); return { enabled: !!policy, policyId: policy?.id ?? 'none', description: policy?.description ?? 'Action widening disabled.', deepOperationCapsByDepth: [...(policy?.deepOperationCapsByDepth ?? [])], byDepth: rows, freshMenuStatesWidened: total('freshMenuStatesWidened'), legalOperationEvaluations: legal, shallowOperationEvaluations: total('shallowOperationEvaluations'), recursivelyDeepenedOperationEvaluations: deep, operationEvaluationsAvoided: total('operationEvaluationsAvoided'), wideningAvoidanceRate: legal ? 1 - deep / legal : 0 }; };
    return { record, report };
}
function summarizeRanks(observations) { const n = observations.length, rate = (limit) => n ? observations.filter(row => row.deepWinnerShallowRank <= limit).length / n : 0; return { samples: n, pRank1: rate(1), pRankLe3: rate(3), pRankLe5: rate(5), pRankLe8: rate(8), pRankLe12: rate(12) }; }
export function summarizeProxyRanks(observations, sampleLimitPerDepth) { const grouped = new Map(); for (const row of observations) {
    const list = grouped.get(row.recursiveDepth) ?? [];
    list.push(row);
    grouped.set(row.recursiveDepth, list);
} const byDepth = {}; for (const [depth, rows] of grouped)
    byDepth[String(depth)] = summarizeRanks(rows); return { sampleLimitPerDepth, observations: [...observations], overall: summarizeRanks(observations), byDepth }; }
//# sourceMappingURL=actionWidening.js.map