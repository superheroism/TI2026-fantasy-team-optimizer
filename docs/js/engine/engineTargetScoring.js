import { evaluateBoardTargetProbabilityFastUncached } from './targetProbability.js';
import { decodeBannerState } from './stateEncoding.js';
const ROLES = ['core', 'mid', 'support'];
/** Exact target-probability terminal evaluator for one layout-scoped compact search. */
export function createEngineTargetScorer(context, data, targetScore, iterations = data.simulation.optimizerIterations, layoutId = 'legacy_3') {
    const bannerMemo = { core: new Map(), mid: new Map(), support: new Map() };
    let bannerMaterializations = 0, bannerCacheHits = 0, bannerCacheMisses = 0;
    const bannerFor = (role, id) => {
        const prior = bannerMemo[role].get(id);
        if (prior) {
            bannerCacheHits++;
            return prior;
        }
        bannerCacheMisses++;
        const banner = decodeBannerState(role, id, context[role], layoutId);
        bannerMemo[role].set(id, banner);
        bannerMaterializations++;
        return banner;
    };
    const evaluate = (state) => {
        if (state.layoutId !== layoutId)
            throw new Error(`Expected ${layoutId} terminal state, got ${state.layoutId}.`);
        const board = { core: bannerFor('core', state.core), mid: bannerFor('mid', state.mid), support: bannerFor('support', state.support) };
        if (layoutId !== 'legacy_3')
            board.layoutId = layoutId;
        return evaluateBoardTargetProbabilityFastUncached(board, data, targetScore, iterations);
    };
    return { evaluate, getDiagnostics: () => ({ bannerMaterializations, bannerCacheEntries: ROLES.reduce((sum, role) => sum + bannerMemo[role].size, 0), bannerCacheHits, bannerCacheMisses }) };
}
//# sourceMappingURL=engineTargetScoring.js.map