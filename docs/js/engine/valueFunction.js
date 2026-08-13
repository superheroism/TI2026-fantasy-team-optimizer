function cacheKey(id, tokens, suffix = '') {
    return `${typeof id}:${String(id)}|${tokens}${suffix}`;
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
    actionEvaluationsByDepth = new Map();
    diagnostics = {
        terminalCacheHits: 0, terminalCacheMisses: 0,
        vCacheHits: 0, vCacheMisses: 0,
        qCacheHits: 0, qCacheMisses: 0,
        actionCacheHits: 0, actionCacheMisses: 0,
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
        if (tokensRemaining <= 0)
            return -Infinity;
        const id = this.model.stateId(state);
        const operationId = this.model.operationId(operation);
        const key = cacheKey(id, tokensRemaining, `|${phase}|${operationId}`);
        const prior = this.actionMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.actionCacheHits++;
            return prior;
        }
        this.diagnostics.actionCacheMisses++;
        this.actionEvaluationsByDepth.set(tokensRemaining, (this.actionEvaluationsByDepth.get(tokensRemaining) ?? 0) + 1);
        const value = this.model.actionValue(state, operation, tokensRemaining, phase, nextState => this.V(nextState, tokensRemaining - 1));
        this.actionMemo.set(key, value);
        return value;
    }
    /** V(B,t): value before observing a fresh menu. */
    V(state, tokensRemaining) {
        const t = Math.max(0, tokensRemaining);
        if (t === 0)
            return this.terminal(state);
        const id = this.model.stateId(state);
        const key = cacheKey(id, t);
        const prior = this.vMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.vCacheHits++;
            return prior;
        }
        this.diagnostics.vCacheMisses++;
        let states = this.statesByDepth.get(t);
        if (!states) {
            states = new Set();
            this.statesByDepth.set(t, states);
        }
        states.add(id);
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
        if (t === 0)
            return this.terminal(state);
        const id = this.model.stateId(state);
        const menuId = this.model.menuId?.(menu)
            ?? this.model.menuOperations(menu).map(operation => this.model.operationId(operation)).sort().join(',');
        const key = cacheKey(id, t, `|${menuId}`);
        const prior = this.qMemo.get(key);
        if (prior !== undefined) {
            this.diagnostics.qCacheHits++;
            return prior;
        }
        this.diagnostics.qCacheMisses++;
        const stop = this.terminal(state);
        let best = t > 1 ? Math.max(stop, this.V(state, t - 1)) : stop;
        for (const operation of this.model.menuOperations(menu)) {
            best = Math.max(best, this.A(state, operation, t, 'current_menu'));
        }
        this.qMemo.set(key, best);
        return best;
    }
    getDiagnostics() {
        const uniqueStatesByDepth = {};
        for (const [depth, states] of this.statesByDepth)
            uniqueStatesByDepth[String(depth)] = states.size;
        const actionEvaluationsByDepth = {};
        for (const [depth, count] of this.actionEvaluationsByDepth)
            actionEvaluationsByDepth[String(depth)] = count;
        return {
            ...this.diagnostics,
            uniqueStatesByDepth,
            actionEvaluationsByDepth,
            elapsedMs: performance.now() - this.startedAt,
        };
    }
}
//# sourceMappingURL=valueFunction.js.map