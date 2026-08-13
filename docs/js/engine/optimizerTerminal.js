import { createEngineExpectedScorer } from './engineExpectedScoring.js';
import { evaluateBoardTargetProbabilityFast } from './targetProbability.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from './stateEncoding.js';
export function createTerminalSearchRuntime(state, data) {
    const context = boardAdapterContext(state.board);
    const initialEngine = boardToEngineState(state.board);
    const expectedScorer = createEngineExpectedScorer(context, data, data.simulation.optimizerIterations);
    const boardMemo = new Map([[initialEngine.id, state.board]]);
    const expectedMemo = new Map();
    const targetMemo = new Map();
    let descriptiveBoardMaterializations = 0, terminalScoringCalls = 0;
    const boardFor = (engine) => {
        const prior = boardMemo.get(engine.id);
        if (prior)
            return prior;
        const board = engineStateToBoard(engine, context);
        boardMemo.set(engine.id, board);
        descriptiveBoardMaterializations++;
        return board;
    };
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
        const value = evaluateBoardTargetProbabilityFast(boardFor(engine), data, state.targetScore ?? 0, data.simulation.optimizerIterations);
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
        const compact = expectedScorer.getDiagnostics();
        return {
            descriptiveBoardMaterializations, descriptiveBoardCacheEntries: boardMemo.size,
            expectedScalarStates: expectedMemo.size, targetScalarStates: targetMemo.size, terminalScoringCalls,
            expectedBannerMaterializations: compact.bannerMaterializations,
            expectedBannerCacheEntries: compact.bannerCacheEntries,
            expectedBannerCacheHits: compact.bannerCacheHits,
            expectedBannerCacheMisses: compact.bannerCacheMisses,
        };
    };
    return { initialEngine, expectedScalar, targetScalar, searchUtility, seedCurrent, diagnostics };
}
//# sourceMappingURL=optimizerTerminal.js.map