import { ACTION_CATALOG } from '../data/actionCatalog.js';
import { enumerateEngineOperation } from './compactTransitions.js';
import { MenuModel } from './menuModel.js';
import { FiniteHorizonValueFunction } from './valueFunction.js';
import { depthRecord, incrementDepth, OPTIMIZER_ROLES, stratifiedTransitions } from './optimizerHelpers.js';
export function createContinuationRuntime(state, data, terminal, uniformStatFallback) {
    const overrideMenus = data.menuSamples?.filter(menu => menu.length === 3);
    const menuModel = new MenuModel(overrideMenus?.length ? overrideMenus : undefined);
    const continuationStrata = Math.max(1, data.simulation.continuationOutcomeStrata ?? 8);
    const continuationEntryStrata = Math.max(1, data.simulation.continuationEntryStrata ?? 12);
    const transitionMemo = new Map();
    let transitionDistributionCacheHits = 0, transitionDistributionCacheMisses = 0, transitionDistributionCacheBypasses = 0;
    const transitionDistribution = (engine, role, operation, retain) => {
        if (!retain) {
            transitionDistributionCacheBypasses++;
            return enumerateEngineOperation(engine, role, operation, uniformStatFallback);
        }
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
    const transitionsFor = (engine, role, operation) => transitionDistribution(engine, role, operation, true);
    // FiniteHorizonValueFunction already memoizes fresh-menu action values. Retaining a second
    // whole-board targeted cache produced ~397k entries for seven hits at default t=3.
    const targetedMemo = new Map();
    let targetedActionCacheHits = 0, targetedActionCacheMisses = 0, targetedActionCacheBypasses = 0;
    const requestsByDepth = new Map(), hitsByDepth = new Map();
    const missesByDepth = new Map(), bypassesByDepth = new Map();
    const transitionEvaluationsByDepth = new Map();
    let valueFunction;
    const targetedContinuation = (engine, operation, role, tokensRemaining, phase) => {
        incrementDepth(requestsByDepth, tokensRemaining);
        const retain = phase === 'current_menu';
        const key = retain ? `${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}` : '';
        if (retain) {
            const prior = targetedMemo.get(key);
            if (prior) {
                targetedActionCacheHits++;
                incrementDepth(hitsByDepth, tokensRemaining);
                return prior;
            }
            targetedActionCacheMisses++;
            incrementDepth(missesByDepth, tokensRemaining);
        }
        else {
            targetedActionCacheBypasses++;
            incrementDepth(bypassesByDepth, tokensRemaining);
        }
        incrementDepth(transitionEvaluationsByDepth, tokensRemaining);
        const exact = transitionDistribution(engine, role, operation, retain);
        if (!exact.length) {
            const empty = { value: -Infinity, utilityOutcomes: [] };
            if (retain)
                targetedMemo.set(key, empty);
            return empty;
        }
        const modeled = phase === 'fresh_menu'
            ? stratifiedTransitions(exact, continuationStrata)
            : (tokensRemaining > 1 ? stratifiedTransitions(exact, continuationEntryStrata) : [...exact]);
        let value = 0;
        const utilityOutcomes = [];
        for (const outcome of modeled) {
            const continuation = valueFunction.V(outcome.nextState, tokensRemaining - 1);
            value += outcome.probability * continuation;
            // Fresh-menu callers consume only the scalar value; current-menu callers need the
            // distribution for visible P10/median/P90 metrics.
            if (retain)
                utilityOutcomes.push({ value: continuation, probability: outcome.probability });
        }
        const result = { value, utilityOutcomes };
        if (retain)
            targetedMemo.set(key, result);
        return result;
    };
    valueFunction = new FiniteHorizonValueFunction({
        stateId: (engine) => engine.id,
        operationId: (operation) => operation.id,
        allOperations: ACTION_CATALOG,
        menuOperations: (menu) => menu,
        menuId: (menu) => menu.map(operation => operation.id).sort().join(','),
        terminalUtility: terminal.searchUtility,
        actionValue: (engine, operation, tokensRemaining, phase) => {
            let best = -Infinity;
            for (const role of OPTIMIZER_ROLES)
                best = Math.max(best, targetedContinuation(engine, operation, role, tokensRemaining, phase).value);
            return best;
        },
        freshMenuExpectedUtility: (_engine, _tokensRemaining, baseline, operationValues) => menuModel.expectedFreshMenuUtility(operationValues, baseline),
    });
    const diagnostics = () => ({
        targetedActionCacheHits, targetedActionCacheMisses, targetedActionCacheBypasses, targetedActionEntries: targetedMemo.size,
        targetedActionRequestsByDepth: depthRecord(requestsByDepth), targetedActionCacheHitsByDepth: depthRecord(hitsByDepth),
        targetedActionCacheMissesByDepth: depthRecord(missesByDepth), targetedActionCacheBypassesByDepth: depthRecord(bypassesByDepth),
        transitionDistributionCacheHits, transitionDistributionCacheMisses, transitionDistributionCacheBypasses,
        transitionDistributionEntries: transitionMemo.size, transitionEvaluationsByDepth: depthRecord(transitionEvaluationsByDepth),
    });
    return { valueFunction, menuModel, transitionsFor, targetedContinuation, diagnostics };
}
//# sourceMappingURL=optimizerContinuation.js.map