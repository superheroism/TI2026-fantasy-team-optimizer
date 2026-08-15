import { rankTeamsForRole, rolePrefixFrontier } from './scoring.js';
import { decodeBannerState } from './stateEncoding.js';
const ROLES = ['core', 'mid', 'support'];
/** Expected-score terminal evaluator for one layout-scoped compact search. */
export function createEngineExpectedScorer(context, data, iterations = data.simulation.optimizerIterations, layoutId = 'legacy_3') {
    const prefixCount = data.titles.prefixes.length;
    const prefixIndex = new Map(data.titles.prefixes.map((prefix, index) => [prefix.id, index]));
    const frontierMemo = { core: new Map(), mid: new Map(), support: new Map() };
    const bannerMemo = { core: new Map(), mid: new Map(), support: new Map() };
    let bannerMaterializations = 0, bannerCacheHits = 0, bannerCacheMisses = 0;
    const bannerFor = (role, id) => {
        const prior = bannerMemo[role].get(id);
        if (prior)
            return prior;
        const banner = decodeBannerState(role, id, context[role], layoutId);
        bannerMemo[role].set(id, banner);
        bannerMaterializations++;
        return banner;
    };
    const vectorizeFrontier = (frontier) => {
        const values = new Float64Array(prefixCount);
        values.fill(Number.NaN);
        for (const entry of frontier) {
            const index = prefixIndex.get(entry.prefixId);
            if (index !== undefined)
                values[index] = entry.adjustedExpected;
        }
        return values;
    };
    const frontierFor = (role, id) => {
        const prior = frontierMemo[role].get(id);
        if (prior) {
            bannerCacheHits++;
            return prior;
        }
        bannerCacheMisses++;
        const frontier = vectorizeFrontier(rolePrefixFrontier(role, bannerFor(role, id), data, iterations, layoutId));
        frontierMemo[role].set(id, frontier);
        return frontier;
    };
    const evaluate = (state) => {
        if (state.layoutId !== layoutId)
            throw new Error(`Expected ${layoutId} terminal state, got ${state.layoutId}.`);
        const core = frontierFor('core', state.core), mid = frontierFor('mid', state.mid), support = frontierFor('support', state.support);
        let best = -Infinity;
        for (let index = 0; index < prefixCount; index++) {
            const coreValue = core[index], midValue = mid[index], supportValue = support[index];
            if (!Number.isFinite(coreValue) || !Number.isFinite(midValue) || !Number.isFinite(supportValue))
                continue;
            best = Math.max(best, coreValue + midValue + supportValue);
        }
        if (Number.isFinite(best))
            return best;
        const board = { core: bannerFor('core', state.core), mid: bannerFor('mid', state.mid), support: bannerFor('support', state.support) };
        if (layoutId !== 'legacy_3')
            board.layoutId = layoutId;
        return ROLES.reduce((sum, role) => sum + (rankTeamsForRole(role, board, data, iterations)[0]?.expected ?? 0), 0);
    };
    return { evaluate, getDiagnostics: () => ({ bannerMaterializations, bannerCacheEntries: ROLES.reduce((sum, role) => sum + frontierMemo[role].size, 0), bannerCacheHits, bannerCacheMisses }) };
}
//# sourceMappingURL=engineExpectedScoring.js.map