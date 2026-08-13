import { evaluateBoard, evaluateBoardExpectedFast } from './scoring.js';
import { evaluateBoardTarget, evaluateBoardTargetProbabilityFast } from './targetProbability.js';
import { enumerateEngineOperation } from './compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from './stateEncoding.js';
import { ACTION_CATALOG, TOTAL_UNIFORM_MENUS } from '../data/actionCatalog.js';
import { MenuModel } from './menuModel.js';
import { FiniteHorizonValueFunction } from './valueFunction.js';
const ROLES = ['core', 'mid', 'support'];
const EMPTY_VALUE_DIAGNOSTICS = {
    terminalCacheHits: 0, terminalCacheMisses: 0, vCacheHits: 0, vCacheMisses: 0, qCacheHits: 0, qCacheMisses: 0,
    actionCacheHits: 0, actionCacheMisses: 0, uniqueStatesByDepth: {}, actionEvaluationsByDepth: {}, elapsedMs: 0,
};
const EMPTY_MENU_DIAGNOSTICS = { calls: 0, uniformCalls: 0, overrideCalls: 0, explicitMenusScanned: 0, operatorMs: 0 };
let lastEngineDiagnostics = {
    descriptiveBoardMaterializations: 0, expectedScalarStates: 0, targetScalarStates: 0, terminalScoringCalls: 0,
    targetedActionCacheHits: 0, targetedActionCacheMisses: 0, transitionDistributionCacheHits: 0, transitionDistributionCacheMisses: 0,
    transitionEvaluationsByDepth: {}, valueFunction: EMPTY_VALUE_DIAGNOSTICS, menuOperator: EMPTY_MENU_DIAGNOSTICS,
};
export function getLastOptimizerEngineDiagnostics() {
    return {
        ...lastEngineDiagnostics,
        transitionEvaluationsByDepth: { ...lastEngineDiagnostics.transitionEvaluationsByDepth },
        valueFunction: {
            ...lastEngineDiagnostics.valueFunction,
            uniqueStatesByDepth: { ...lastEngineDiagnostics.valueFunction.uniqueStatesByDepth },
            actionEvaluationsByDepth: { ...lastEngineDiagnostics.valueFunction.actionEvaluationsByDepth },
        },
        menuOperator: { ...lastEngineDiagnostics.menuOperator },
    };
}
function utility(evaluation, state) {
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
function weightedQuantile(points, q) {
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
/** Deterministic probability-strata compression retained from the pre-DP two-step policy. */
function stratifiedTransitions(outcomes, maxStrata) {
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
        const chosen = normalized[index];
        selected.push({ ...chosen, probability: 1 / maxStrata });
    }
    const grouped = new Map();
    for (const x of selected) {
        const key = x.nextState.id, prior = grouped.get(key);
        if (prior)
            prior.probability += x.probability;
        else
            grouped.set(key, { ...x });
    }
    return [...grouped.values()];
}
/**
 * M4 finite-horizon policy. Production remains explicitly capped at two modeled
 * token spends; the reusable V/Q architecture is introduced without starting M5.
 */
export function recommendNextAction(state, data, uniformStatFallback = true) {
    const overrideMenus = data.menuSamples?.filter(menu => menu.length === 3);
    const menuModel = new MenuModel(overrideMenus?.length ? overrideMenus : undefined);
    const horizon = Math.max(1, Math.min(state.tokensRemaining, data.simulation.maxLookaheadTokens ?? 2, 2));
    const continuationStrata = Math.max(1, data.simulation.continuationOutcomeStrata ?? 8);
    const continuationEntryStrata = Math.max(1, data.simulation.continuationEntryStrata ?? 12);
    const context = boardAdapterContext(state.board);
    const initialEngine = boardToEngineState(state.board);
    const boardMemo = new Map([[initialEngine.id, state.board]]);
    let descriptiveBoardMaterializations = 0;
    const boardFor = (engine) => {
        const prior = boardMemo.get(engine.id);
        if (prior)
            return prior;
        const board = engineStateToBoard(engine, context);
        boardMemo.set(engine.id, board);
        descriptiveBoardMaterializations++;
        return board;
    };
    const scalarMemo = new Map();
    const targetMemo = new Map();
    let terminalScoringCalls = 0;
    const expectedScalar = (engine) => {
        const prior = scalarMemo.get(engine.id);
        if (prior !== undefined)
            return prior;
        terminalScoringCalls++;
        const value = evaluateBoardExpectedFast(boardFor(engine), data, data.simulation.optimizerIterations);
        scalarMemo.set(engine.id, value);
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
    const transitionMemo = new Map();
    let transitionDistributionCacheHits = 0, transitionDistributionCacheMisses = 0;
    const transitionsFor = (engine, role, operation) => {
        const key = `${engine.id}|${role}|${operation.id}`;
        const prior = transitionMemo.get(key);
        if (prior) {
            transitionDistributionCacheHits++;
            return prior;
        }
        transitionDistributionCacheMisses++;
        const outcomes = enumerateEngineOperation(engine, role, operation, uniformStatFallback);
        transitionMemo.set(key, outcomes);
        return outcomes;
    };
    const targetedMemo = new Map();
    let targetedActionCacheHits = 0, targetedActionCacheMisses = 0;
    const transitionEvaluationsByDepth = new Map();
    let valueFunction;
    const targetedContinuation = (engine, operation, role, tokensRemaining, phase) => {
        const key = `${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}`;
        const prior = targetedMemo.get(key);
        if (prior) {
            targetedActionCacheHits++;
            return prior;
        }
        targetedActionCacheMisses++;
        transitionEvaluationsByDepth.set(tokensRemaining, (transitionEvaluationsByDepth.get(tokensRemaining) ?? 0) + 1);
        const exact = transitionsFor(engine, role, operation);
        if (!exact.length) {
            const empty = { value: -Infinity, utilityOutcomes: [] };
            targetedMemo.set(key, empty);
            return empty;
        }
        // Preserve M3 fidelity asymmetry exactly:
        // - visible one-step actions: complete distribution;
        // - visible first-step continuation: continuationEntryStrata;
        // - actions reached through a fresh menu: continuationOutcomeStrata.
        const modeled = phase === 'fresh_menu'
            ? stratifiedTransitions(exact, continuationStrata)
            : (tokensRemaining > 1 ? stratifiedTransitions(exact, continuationEntryStrata) : [...exact]);
        let value = 0;
        const utilityOutcomes = [];
        for (const outcome of modeled) {
            const continuation = valueFunction.V(outcome.nextState, tokensRemaining - 1);
            value += outcome.probability * continuation;
            utilityOutcomes.push({ value: continuation, probability: outcome.probability });
        }
        const result = { value, utilityOutcomes };
        targetedMemo.set(key, result);
        return result;
    };
    valueFunction = new FiniteHorizonValueFunction({
        stateId: (engine) => engine.id,
        operationId: (operation) => operation.id,
        allOperations: ACTION_CATALOG,
        menuOperations: (menu) => menu,
        menuId: (menu) => menu.map(operation => operation.id).sort().join(','),
        terminalUtility: searchUtility,
        actionValue: (engine, operation, tokensRemaining, phase) => {
            let best = -Infinity;
            for (const role of ROLES)
                best = Math.max(best, targetedContinuation(engine, operation, role, tokensRemaining, phase).value);
            return best;
        },
        freshMenuExpectedUtility: (_engine, _tokensRemaining, baseline, operationValues) => menuModel.expectedFreshMenuUtility(operationValues, baseline),
    });
    terminalScoringCalls++;
    const current = state.objective === 'target_probability'
        ? evaluateBoardTarget(state.board, state.username, data, state.targetScore ?? 0, data.simulation.optimizerIterations)
        : evaluateBoard(state.board, state.username, data, state.targetScore);
    const stopUtility = utility(current, state);
    // Seed both the objective scalar and V/Q terminal memo with the full current evaluation.
    if (state.objective === 'expected_score')
        scalarMemo.set(initialEngine.id, current.expected);
    else if (current.targetProbability !== undefined)
        targetMemo.set(initialEngine.id, current.targetProbability);
    valueFunction.seedTerminalUtility(initialEngine, stopUtility);
    const rows = [{
            action: { kind: 'stop' }, expectedFinalUtility: stopUtility, expectedFinalScore: current.expected,
            tokensAfter: state.tokensRemaining, assetAtRisk: 'none', confidence: current.confidence, status: 'evaluated',
            note: 'Preserves the board; free team-by-role selection is re-optimized.',
        }];
    if (state.tokensRemaining > 0) {
        for (const operation of state.menu) {
            for (const role of ROLES) {
                const outcomes = transitionsFor(initialEngine, role, operation);
                if (!outcomes.length)
                    continue;
                let scoreEv = 0, pImprove = 0, worst = Infinity;
                // User-visible immediate metrics remain full-distribution calculations.
                for (const outcome of outcomes) {
                    const immediateExpected = expectedScalar(outcome.nextState);
                    const immediateUtility = state.objective === 'expected_score' ? immediateExpected : targetScalar(outcome.nextState);
                    scoreEv += outcome.probability * immediateExpected;
                    if (immediateUtility > stopUtility)
                        pImprove += outcome.probability;
                    worst = Math.min(worst, immediateExpected);
                }
                const continuation = targetedContinuation(initialEngine, operation, role, horizon, 'current_menu');
                const points = [...continuation.utilityOutcomes];
                const p10 = weightedQuantile(points, .10), median = weightedQuantile(points, .50), p90 = weightedQuantile(points, .90);
                const row = {
                    action: { kind: 'board_action', operationId: operation.id, banner: role },
                    expectedFinalUtility: continuation.value, expectedFinalScore: scoreEv, pImprove,
                    tokensAfter: state.tokensRemaining - 1, assetAtRisk: `${role} banner`, confidence: current.confidence, status: 'evaluated',
                };
                if (p10 !== undefined)
                    row.outcomeP10Utility = p10;
                if (median !== undefined)
                    row.outcomeMedianUtility = median;
                if (p90 !== undefined)
                    row.outcomeP90Utility = p90;
                if (Number.isFinite(worst))
                    row.downside = worst - current.expected;
                if (state.tokensRemaining > horizon)
                    row.note = `Decision lookahead capped at ${horizon} tokens for browser performance.`;
                else if (horizon > 1)
                    row.note = `Two-step continuation uses deterministic probability stratification (${continuationEntryStrata} entry / ${continuationStrata} future-outcome strata max).`;
                rows.push(row);
            }
        }
        const nextTokens = state.tokensRemaining - 1;
        if (nextTokens === 0) {
            rows.push({
                action: { kind: 'menu_reroll' }, expectedFinalUtility: stopUtility, expectedFinalScore: current.expected, tokensAfter: 0,
                assetAtRisk: 'last token; board preserved', confidence: current.confidence, status: 'evaluated',
                note: 'Fresh menu cannot be acted on with 0 tokens remaining.',
            });
        }
        else {
            // M4 production is still a two-spend model, so a current menu reroll leaves
            // exactly one modeled spend regardless of any larger real token balance.
            const ev = valueFunction.V(initialEngine, 1);
            rows.push({
                action: { kind: 'menu_reroll' }, expectedFinalUtility: ev, expectedFinalScore: current.expected, tokensAfter: nextTokens,
                assetAtRisk: '1 token; board preserved', confidence: current.confidence, status: 'evaluated',
                note: menuModel.mode === 'known_uniform'
                    ? `Fresh menu is a uniform draw of 3 distinct actions from 20; expectation uses the exact combinatorial operator equivalent to ${TOTAL_UNIFORM_MENUS.toLocaleString()} menus.`
                    : `Fresh-menu expectation uses ${overrideMenus?.length ?? 0} supplied menu samples.`,
            });
        }
    }
    // Exercise/cache the canonical current-menu Q object. The ranked rows remain
    // descriptive because they retain per-target immediate metrics and quantiles.
    if (state.tokensRemaining > 0)
        valueFunction.Q(initialEngine, state.menu, horizon);
    const ranking = rows.sort((a, b) => b.expectedFinalUtility - a.expectedFinalUtility);
    const transitionDepthRecord = {};
    for (const [depth, count] of transitionEvaluationsByDepth)
        transitionDepthRecord[String(depth)] = count;
    lastEngineDiagnostics = {
        descriptiveBoardMaterializations,
        expectedScalarStates: scalarMemo.size,
        targetScalarStates: targetMemo.size,
        terminalScoringCalls,
        targetedActionCacheHits,
        targetedActionCacheMisses,
        transitionDistributionCacheHits,
        transitionDistributionCacheMisses,
        transitionEvaluationsByDepth: transitionDepthRecord,
        valueFunction: valueFunction.getDiagnostics(),
        menuOperator: menuModel.getDiagnostics(),
    };
    return { current, ranking, recommendation: ranking[0], futureMenuMode: menuModel.mode };
}
//# sourceMappingURL=optimizer.js.map