import { evaluateBoard } from './scoring.js';
import { enumerateOperation } from './transitions.js';
const ROLES = ['core', 'mid', 'support'];
function utility(evaluation, state) {
    return state.objective === 'target_probability' ? (evaluation.targetProbability ?? 0) : evaluation.expected;
}
export function formatAction(action, state) {
    if (action.kind === 'stop')
        return 'Stop / lock';
    if (action.kind === 'menu_reroll')
        return 'Reroll operation menu';
    const label = state?.menu.find(o => o.id === action.operationId)?.label ?? action.operationId;
    return `${action.banner.toUpperCase()} → ${label}`;
}
function stateKey(state, depth) {
    return JSON.stringify({ b: state.board, t: state.tokensRemaining, m: state.menu, o: state.objective, x: state.targetScore ?? null, u: state.username, d: depth });
}
function menusFromData(data) { return data.menuSamples?.filter(m => m.length === 3) ?? []; }
export function recommendNextAction(state, data, uniformStatFallback) {
    const menuSamples = menusFromData(data);
    const maxDepth = Math.max(0, Math.min(state.tokensRemaining, data.simulation.maxLookaheadTokens ?? state.tokensRemaining));
    const evalMemo = new Map();
    const valueMemo = new Map();
    const evaluate = (s) => {
        const key = JSON.stringify({ b: s.board, u: s.username, x: s.targetScore ?? null });
        const cached = evalMemo.get(key);
        if (cached)
            return cached;
        const value = evaluateBoard(s.board, s.username, data, s.targetScore);
        evalMemo.set(key, value);
        return value;
    };
    const bestFutureValue = (s, depth) => {
        const key = stateKey(s, depth);
        const cached = valueMemo.get(key);
        if (cached !== undefined)
            return cached;
        const stop = utility(evaluate(s), s);
        if (s.tokensRemaining <= 0 || depth <= 0) {
            valueMemo.set(key, stop);
            return stop;
        }
        const rows = evaluateVisible(s, depth, false);
        const best = rows.reduce((v, r) => r.status === 'evaluated' ? Math.max(v, r.expectedFinalUtility) : v, stop);
        valueMemo.set(key, best);
        return best;
    };
    const continueAfterSpend = (base, depth) => {
        const immediate = utility(evaluate(base), base);
        if (base.tokensRemaining <= 0 || depth <= 1 || menuSamples.length === 0)
            return immediate;
        return menuSamples.reduce((sum, menu) => sum + bestFutureValue({ ...base, menu: structuredClone(menu) }, depth - 1), 0) / menuSamples.length;
    };
    function evaluateVisible(s, depth, includeUnavailable) {
        const current = evaluate(s);
        const stopUtility = utility(current, s);
        const rows = [{ action: { kind: 'stop' }, expectedFinalUtility: stopUtility, expectedFinalScore: current.expected, tokensAfter: s.tokensRemaining, assetAtRisk: 'none', confidence: current.confidence, status: 'evaluated', note: 'Preserves the board; free team-by-role selection is already re-optimized. Title is included only when calibrated title data exist.' }];
        if (s.tokensRemaining <= 0)
            return rows;
        for (const op of s.menu) {
            for (const role of ROLES) {
                const outcomes = enumerateOperation(s.board, role, op, uniformStatFallback);
                if (!outcomes.length) {
                    if (includeUnavailable && op.kind !== 'stat_reroll')
                        rows.push({ action: { kind: 'board_action', operationId: op.id, banner: role }, expectedFinalUtility: -Infinity, expectedFinalScore: current.expected, tokensAfter: s.tokensRemaining - 1, assetAtRisk: `${role} banner`, confidence: 'low', status: 'needs_transition_model', note: 'Quality/trait transition probabilities are intentionally not fabricated.' });
                    continue;
                }
                let scoreEv = 0, utilEv = 0, pImprove = 0, worst = Infinity;
                for (const outcome of outcomes) {
                    const next = { ...s, board: outcome.board, tokensRemaining: s.tokensRemaining - 1 };
                    const immediate = evaluate(next);
                    scoreEv += outcome.probability * immediate.expected;
                    if (immediate.expected > current.expected)
                        pImprove += outcome.probability;
                    worst = Math.min(worst, immediate.expected);
                    utilEv += outcome.probability * continueAfterSpend(next, depth);
                }
                const row = { action: { kind: 'board_action', operationId: op.id, banner: role }, expectedFinalUtility: utilEv, expectedFinalScore: scoreEv, pImprove, tokensAfter: s.tokensRemaining - 1, assetAtRisk: `${role} banner`, confidence: uniformStatFallback && op.kind === 'stat_reroll' && !op.outcomeWeights ? 'low' : menuSamples.length ? 'medium' : 'low', status: 'evaluated' };
                if (Number.isFinite(worst))
                    row.downside = worst - current.expected;
                if (s.tokensRemaining > 1 && menuSamples.length === 0)
                    row.note = 'Visible action valued terminally; future-menu distribution is not yet calibrated.';
                else if (s.tokensRemaining > depth)
                    row.note = `Lookahead capped at ${depth} token${depth === 1 ? '' : 's'} for browser performance.`;
                rows.push(row);
            }
        }
        if (s.menuRerollAvailable && s.tokensRemaining >= 2) {
            if (menuSamples.length) {
                const nextTokens = s.tokensRemaining - 1;
                const ev = menuSamples.reduce((sum, menu) => sum + bestFutureValue({ ...s, tokensRemaining: nextTokens, menu: structuredClone(menu) }, depth - 1), 0) / menuSamples.length;
                rows.push({ action: { kind: 'menu_reroll' }, expectedFinalUtility: ev, expectedFinalScore: current.expected, tokensAfter: nextTokens, assetAtRisk: '1 token; board preserved', confidence: 'medium', status: 'evaluated', note: `Whole-menu empirical bootstrap across ${menuSamples.length} observed menus.` });
            }
            else if (includeUnavailable) {
                rows.push({ action: { kind: 'menu_reroll' }, expectedFinalUtility: -Infinity, expectedFinalScore: current.expected, tokensAfter: s.tokensRemaining - 1, assetAtRisk: '1 token; board preserved', confidence: 'low', status: 'needs_menu_model', note: 'Recognized but not ranked until an empirical next-menu distribution is supplied.' });
            }
        }
        return rows;
    }
    const current = evaluate(state);
    const ranking = evaluateVisible(state, maxDepth, true).sort((a, b) => b.expectedFinalUtility - a.expectedFinalUtility);
    return { current, ranking, recommendation: ranking.find(r => r.status === 'evaluated') ?? ranking[0], futureMenuMode: menuSamples.length ? 'calibrated' : 'not_calibrated' };
}
//# sourceMappingURL=optimizer.js.map