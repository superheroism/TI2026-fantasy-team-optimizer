import { createEngineExpectedScorer } from './engineExpectedScoring.js';
import { createEngineTargetScorer } from './engineTargetScoring.js';
import { boardAdapterContext, boardToEngineState } from './stateEncoding.js';
export function createTerminalSearchRuntime(state, data) {
    const context = boardAdapterContext(state.board);
    const initialEngine = boardToEngineState(state.board);
    const expectedScorer = createEngineExpectedScorer(context, data, data.simulation.optimizerIterations, initialEngine.layoutId);
    const targetScorer = createEngineTargetScorer(context, data, state.targetScore ?? 0, data.simulation.optimizerIterations, initialEngine.layoutId);
    const expectedMemo = new Map();
    const targetMemo = new Map();
    let terminalScoringCalls = 0;
    const expectedScalar = (engine) => {
        const prior = expectedMemo.get(engine.id);
        if (prior !== undefined)
            return prior;
        terminalScoringCalls++;
        const value = expectedScorer.evaluate(engine);
        expectedMemo.set(engine.id, value);
        return value;
    };
    const targetScalar = (engine) => {
        const prior = targetMemo.get(engine.id);
        if (prior !== undefined)
            return prior;
        terminalScoringCalls++;
        const value = targetScorer.evaluate(engine);
        targetMemo.set(engine.id, value);
        return value;
    };
    const searchUtility = (engine) => state.objective === 'expected_score' ? expectedScalar(engine) : targetScalar(engine);
    const seedCurrent = (current) => {
        if (state.objective === 'expected_score')
            expectedMemo.set(initialEngine.id, current.expected);
        else if (current.targetProbability !== undefined)
            targetMemo.set(initialEngine.id, current.targetProbability);
    };
    const diagnostics = () => {
        const expectedCompact = expectedScorer.getDiagnostics(), targetCompact = targetScorer.getDiagnostics();
        return {
            descriptiveBoardMaterializations: 0, descriptiveBoardCacheEntries: 1,
            expectedScalarStates: expectedMemo.size, targetScalarStates: targetMemo.size, terminalScoringCalls,
            expectedBannerMaterializations: expectedCompact.bannerMaterializations,
            expectedBannerCacheEntries: expectedCompact.bannerCacheEntries,
            expectedBannerCacheHits: expectedCompact.bannerCacheHits,
            expectedBannerCacheMisses: expectedCompact.bannerCacheMisses,
            targetBannerMaterializations: targetCompact.bannerMaterializations,
            targetBannerCacheEntries: targetCompact.bannerCacheEntries,
            targetBannerCacheHits: targetCompact.bannerCacheHits,
            targetBannerCacheMisses: targetCompact.bannerCacheMisses,
        };
    };
    return { initialEngine, expectedScalar, targetScalar, searchUtility, seedCurrent, diagnostics };
}
//# sourceMappingURL=optimizerTerminal.js.map