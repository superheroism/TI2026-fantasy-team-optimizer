function cacheKey(id, tokens, suffix = '') {
    return `${typeof id}:${String(id)}|${tokens}${suffix}`;
}
function bump(map, depth) {
    map.set(depth, (map.get(depth) ?? 0) + 1);
}
function toRecord(map) {
    const result = {};
    for (const [depth, count] of map)
        result[String(depth)] = count;
    return result;
}
function setSizes(map) {
    const result = {};
    for (const [depth, values] of map)
        result[String(depth)] = values.size;
    return result;
}
/**
 * Generic finite-horizon V/Q engine. Mechanics and scoring are callbacks; the
 * engine owns only token recursion, stopping/menu-reroll policy, and memoization.
 */
export class FiniteHorizonValueFunction {
    model;
    startedAt = performance.now();
    terminalMemo = new Map();
    vMemo = new Map();
    qMemo = new Map();
    actionMemo = new Map();
    statesByDepth = new Map();
    qStatesByDepth = new Map();
    actionStatesByDepth = new Map();
    vCallsByDepth = new Map();
    vCacheHitsByDepth = new Map();
    vCacheMissesByDepth = new Map();
    qCallsByDepth = new Map();
    qCacheHitsByDepth = new Map();
    qCacheMissesByDepth = new Map();
    actionCallsByDepth = new Map();
    actionCacheHitsByDepth = new Map();
    actionCacheMissesByDepth = new Map();
    actionEvaluationsByDepth = new Map();
    diagnostics = {
        terminalCacheHits: 0, terminalCacheMisses: 0,
        vCalls: 0, vCacheHits: 0, vCacheMisses: 0,
        qCalls: 0, qCacheHits: 0, qCacheMisses: 0,
        actionCalls: 0, actionCacheHits: 0, actionCacheMisses: 0,
    };
    constructor(model) {
        this.model = model;
    }
    seedTerminalUtility(state, value) {
        this.terminalMemo.set(this.model.stateId(state), value);
    }
    terminal(state) {
        const id = this.model.stateId(state);
        const prior = this.terminalMemo.get(id);
        if (prior !== undefined) {
            this.diagnostics.terminalCacheHits++;
            return prior;
        }
        this.diagnostics.terminalCacheMisses++;
        const value = this.model.terminalUtility(state);
        this.terminalMemo.set(id, value);
        return value;
    }
    /** A(B,a,t): action continuation value. */
    A(state, operation, tokensRemaining, phase) {
        const t = Math.max(0, tokensRemaining);
        this.diagnostics.actionCalls++;
        bump(this.actionCallsByDepth, t);
        const id = this.model.stateId(state);
        const operationId = this.model.operationId(operation);
        const key = cacheKey(id, t, `|${phase}|${operationId}`);
        let states = this.actionStatesByDepth.get(t);
        if (!states) {
            states = new Set();
            this.actionStatesByDepth.set(t, states);
        }
        states.add(key);
        if (t <= 0)
            return -Infinity;
        const prior = this.actionMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.actionCacheHits++;
            bump(this.actionCacheHitsByDepth, t);
            return prior;
        }
        this.diagnostics.actionCacheMisses++;
        bump(this.actionCacheMissesByDepth, t);
        bump(this.actionEvaluationsByDepth, t);
        const value = this.model.actionValue(state, operation, t, phase, nextState => this.V(nextState, t - 1));
        this.actionMemo.set(key, value);
        return value;
    }
    /** V(B,t): value before observing a fresh menu. */
    V(state, tokensRemaining) {
        const t = Math.max(0, tokensRemaining);
        this.diagnostics.vCalls++;
        bump(this.vCallsByDepth, t);
        const id = this.model.stateId(state);
        let states = this.statesByDepth.get(t);
        if (!states) {
            states = new Set();
            this.statesByDepth.set(t, states);
        }
        states.add(id);
        if (t === 0)
            return this.terminal(state);
        const key = cacheKey(id, t);
        const prior = this.vMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.vCacheHits++;
            bump(this.vCacheHitsByDepth, t);
            return prior;
        }
        this.diagnostics.vCacheMisses++;
        bump(this.vCacheMissesByDepth, t);
        const stop = this.terminal(state);
        // Spending the last token on a menu reroll cannot improve the board. With
        // two or more modeled spends remaining, reroll continuation is V(B,t-1).
        const reroll = t > 1 ? this.V(state, t - 1) : stop;
        const baseline = Math.max(stop, reroll);
        const operationValues = this.model.allOperations.map(operation => ({
            id: this.model.operationId(operation),
            value: this.A(state, operation, t, 'fresh_menu'),
        }));
        const value = this.model.freshMenuExpectedUtility(state, t, baseline, operationValues);
        this.vMemo.set(key, value);
        return value;
    }
    /** Q(B,M,t): value after observing the current menu. */
    Q(state, menu, tokensRemaining) {
        const t = Math.max(0, tokensRemaining);
        this.diagnostics.qCalls++;
        bump(this.qCallsByDepth, t);
        const id = this.model.stateId(state);
        let states = this.qStatesByDepth.get(t);
        if (!states) {
            states = new Set();
            this.qStatesByDepth.set(t, states);
        }
        states.add(id);
        if (t === 0)
            return this.terminal(state);
        const menuId = this.model.menuId?.(menu)
            ?? this.model.menuOperations(menu).map(operation => this.model.operationId(operation)).sort().join(',');
        const key = cacheKey(id, t, `|${menuId}`);
        const prior = this.qMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.qCacheHits++;
            bump(this.qCacheHitsByDepth, t);
            return prior;
        }
        this.diagnostics.qCacheMisses++;
        bump(this.qCacheMissesByDepth, t);
        const stop = this.terminal(state);
        let best = t > 1 ? Math.max(stop, this.V(state, t - 1)) : stop;
        for (const operation of this.model.menuOperations(menu)) {
            best = Math.max(best, this.A(state, operation, t, 'current_menu'));
        }
        this.qMemo.set(key, best);
        return best;
    }
    getDiagnostics() {
        return {
            ...this.diagnostics,
            uniqueStatesByDepth: setSizes(this.statesByDepth),
            uniqueQStatesByDepth: setSizes(this.qStatesByDepth),
            uniqueActionStatesByDepth: setSizes(this.actionStatesByDepth),
            vCallsByDepth: toRecord(this.vCallsByDepth),
            vCacheHitsByDepth: toRecord(this.vCacheHitsByDepth),
            vCacheMissesByDepth: toRecord(this.vCacheMissesByDepth),
            qCallsByDepth: toRecord(this.qCallsByDepth),
            qCacheHitsByDepth: toRecord(this.qCacheHitsByDepth),
            qCacheMissesByDepth: toRecord(this.qCacheMissesByDepth),
            actionCallsByDepth: toRecord(this.actionCallsByDepth),
            actionCacheHitsByDepth: toRecord(this.actionCacheHitsByDepth),
            actionCacheMissesByDepth: toRecord(this.actionCacheMissesByDepth),
            actionEvaluationsByDepth: toRecord(this.actionEvaluationsByDepth),
            terminalEntries: this.terminalMemo.size,
            vEntries: this.vMemo.size,
            qEntries: this.qMemo.size,
            actionEntries: this.actionMemo.size,
            elapsedMs: performance.now() - this.startedAt,
        };
    }
}
//# sourceMappingURL=valueFunction.js.map