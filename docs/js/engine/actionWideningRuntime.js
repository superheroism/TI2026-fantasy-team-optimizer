import { createActionWideningTracker, isLegalOperationUtility, selectDeepOperationIds, } from './actionWidening.js';
export function createFreshMenuActionWideningRuntime(options) {
    const plans = new Map();
    const tracker = createActionWideningTracker(options.policy);
    const recursiveDepth = (tokensRemaining) => Math.max(1, Math.floor(options.modeledHorizon) - tokensRemaining);
    const keyFor = (state, tokensRemaining) => `${String(options.stateId(state))}|${tokensRemaining}`;
    const planFor = (state, tokensRemaining) => {
        const key = keyFor(state, tokensRemaining), prior = plans.get(key);
        if (prior)
            return prior;
        const shallow = options.operations.map(operation => ({ id: options.operationId(operation), value: options.shallowValue(state, operation, tokensRemaining) }));
        const deepIds = selectDeepOperationIds(options.policy, recursiveDepth(tokensRemaining), shallow);
        const legal = shallow.filter(row => isLegalOperationUtility(row.value)).length;
        tracker.record(recursiveDepth(tokensRemaining), options.operations.length, legal, deepIds.size);
        const plan = { shallowById: new Map(shallow.map(row => [row.id, row.value])), deepIds, remaining: options.operations.length };
        plans.set(key, plan);
        return plan;
    };
    const evaluate = (state, operation, tokensRemaining, phase) => {
        if (phase !== 'fresh_menu')
            return options.deepValue(state, operation, tokensRemaining, phase);
        const key = keyFor(state, tokensRemaining), plan = planFor(state, tokensRemaining), operationId = options.operationId(operation), shallow = plan.shallowById.get(operationId) ?? -Infinity;
        const value = plan.deepIds.has(operationId) ? options.deepValue(state, operation, tokensRemaining, phase) : shallow;
        plan.remaining--;
        if (plan.remaining <= 0)
            plans.delete(key);
        return value;
    };
    return { evaluate, report: tracker.report };
}
//# sourceMappingURL=actionWideningRuntime.js.map