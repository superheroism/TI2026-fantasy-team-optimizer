import { evaluateBoard, evaluateBoardExpectedFast, evaluateBoardTargetProbabilityFast } from './scoring.js';
import { enumerateOperation } from './transitions.js';
import { ACTION_CATALOG, allUniformMenus, TOTAL_UNIFORM_MENUS } from '../data/actionCatalog.js';
const ROLES = ['core', 'mid', 'support'];
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
/**
 * V1 exact transition rules are now complete for all 20 actions. To keep browser
 * runtime bounded, continuation is evaluated to a maximum of one fresh menu after
 * the current spend (a two-token decision horizon). The UI labels this cap whenever
 * more tokens remain.
 */
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
function stratifiedTransitions(outcomes, maxStrata) {
    if (maxStrata <= 0 || outcomes.length <= maxStrata)
        return outcomes;
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
        const item = { board: chosen.board, probability: 1 / maxStrata };
        if (chosen.note)
            item.note = chosen.note;
        selected.push(item);
    }
    const grouped = new Map();
    for (const x of selected) {
        const key = JSON.stringify(x.board), prior = grouped.get(key);
        if (prior)
            prior.probability += x.probability;
        else
            grouped.set(key, { ...x });
    }
    return [...grouped.values()];
}
export function recommendNextAction(state, data, uniformStatFallback = true) {
    const menuSamples = data.menuSamples?.filter(m => m.length === 3) ?? allUniformMenus();
    const usingOverrideMenus = Boolean(data.menuSamples?.length);
    const horizon = Math.max(1, Math.min(state.tokensRemaining, data.simulation.maxLookaheadTokens ?? 2, 2));
    const continuationStrata = Math.max(1, data.simulation.continuationOutcomeStrata ?? 8);
    const continuationEntryStrata = Math.max(1, data.simulation.continuationEntryStrata ?? 12);
    const fullEvalMemo = new Map();
    const scalarMemo = new Map();
    const freshMenuMemo = new Map();
    const evaluateFull = (s) => {
        const key = JSON.stringify({ b: s.board, u: s.username, x: s.targetScore ?? null });
        const prior = fullEvalMemo.get(key);
        if (prior)
            return prior;
        const value = evaluateBoard(s.board, s.username, data, s.targetScore);
        fullEvalMemo.set(key, value);
        return value;
    };
    const expectedScalar = (s) => {
        const key = JSON.stringify(s.board);
        const prior = scalarMemo.get(key);
        if (prior !== undefined)
            return prior;
        const value = evaluateBoardExpectedFast(s.board, data, data.simulation.optimizerIterations);
        scalarMemo.set(key, value);
        return value;
    };
    // Expected-score search can use the scalar composition exactly. Target-probability mode still
    // requires full board samples and therefore follows the slower distribution path.
    const targetMemo = new Map();
    const targetScalar = (s) => {
        const target = s.targetScore ?? 0, key = JSON.stringify({ b: s.board, x: target });
        const prior = targetMemo.get(key);
        if (prior !== undefined)
            return prior;
        const value = evaluateBoardTargetProbabilityFast(s.board, data, target, data.simulation.optimizerIterations);
        targetMemo.set(key, value);
        return value;
    };
    const searchUtility = (s) => s.objective === 'expected_score' ? expectedScalar(s) : targetScalar(s);
    const terminalActionUtility = (s, operationId) => {
        const op = ACTION_CATALOG.find(x => x.id === operationId);
        if (!op)
            return -Infinity;
        let best = -Infinity;
        for (const role of ROLES) {
            const outcomes = stratifiedTransitions(enumerateOperation(s.board, role, op, uniformStatFallback), continuationStrata);
            if (!outcomes.length)
                continue;
            let ev = 0;
            for (const outcome of outcomes) {
                const next = { ...s, board: outcome.board, tokensRemaining: Math.max(0, s.tokensRemaining - 1) };
                ev += outcome.probability * searchUtility(next);
            }
            best = Math.max(best, ev);
        }
        return best;
    };
    const expectedFreshMenuTerminalUtility = (s) => {
        const key = JSON.stringify({ b: s.board, t: s.tokensRemaining, u: s.username, o: s.objective, x: s.targetScore ?? null });
        const prior = freshMenuMemo.get(key);
        if (prior !== undefined)
            return prior;
        const stop = searchUtility(s);
        if (s.tokensRemaining <= 0) {
            freshMenuMemo.set(key, stop);
            return stop;
        }
        const values = new Map();
        for (const op of ACTION_CATALOG)
            values.set(op.id, terminalActionUtility(s, op.id));
        let sum = 0;
        for (const menu of menuSamples) {
            let best = stop;
            for (const op of menu)
                best = Math.max(best, values.get(op.id) ?? -Infinity);
            sum += best;
        }
        const result = sum / Math.max(menuSamples.length, 1);
        freshMenuMemo.set(key, result);
        return result;
    };
    const continuationUtility = (next) => {
        const immediate = searchUtility(next);
        if (horizon < 2 || next.tokensRemaining <= 0)
            return immediate;
        return expectedFreshMenuTerminalUtility(next);
    };
    const current = evaluateFull(state), stopUtility = state.objective === 'expected_score' ? current.expected : utility(current, state);
    // Seed scalar current value with the fully evaluated value to ensure identical stop reference.
    if (state.objective === 'expected_score')
        scalarMemo.set(JSON.stringify(state.board), current.expected);
    const rows = [{ action: { kind: 'stop' }, expectedFinalUtility: stopUtility, expectedFinalScore: current.expected, tokensAfter: state.tokensRemaining, assetAtRisk: 'none', confidence: current.confidence, status: 'evaluated', note: 'Preserves the board; free team-by-role selection is re-optimized.' }];
    if (state.tokensRemaining > 0) {
        for (const op of state.menu) {
            for (const role of ROLES) {
                const outcomes = enumerateOperation(state.board, role, op, uniformStatFallback);
                if (!outcomes.length)
                    continue;
                let scoreEv = 0, utilEv = 0, pImprove = 0, worst = Infinity;
                // Immediate metrics use the complete known transition distribution.
                for (const outcome of outcomes) {
                    const next = { ...state, board: outcome.board, tokensRemaining: state.tokensRemaining - 1 };
                    const immediateExpected = expectedScalar(next), immediateUtility = state.objective === 'expected_score' ? immediateExpected : targetScalar(next);
                    scoreEv += outcome.probability * immediateExpected;
                    if (immediateUtility > stopUtility)
                        pImprove += outcome.probability;
                    worst = Math.min(worst, immediateExpected);
                }
                // Only the expensive second-step continuation integral is deterministically compressed.
                // The displayed reroll-outcome interval is taken from this same weighted continuation distribution,
                // keeping the range internally consistent with expectedFinalUtility without adding another search pass.
                const continuationOutcomes = horizon > 1 && state.tokensRemaining > 1 ? stratifiedTransitions(outcomes, continuationEntryStrata) : outcomes;
                const utilityOutcomes = [];
                for (const outcome of continuationOutcomes) {
                    const next = { ...state, board: outcome.board, tokensRemaining: state.tokensRemaining - 1 };
                    const value = continuationUtility(next);
                    utilEv += outcome.probability * value;
                    utilityOutcomes.push({ value, probability: outcome.probability });
                }
                const p10 = weightedQuantile(utilityOutcomes, .10), median = weightedQuantile(utilityOutcomes, .50), p90 = weightedQuantile(utilityOutcomes, .90);
                const row = { action: { kind: 'board_action', operationId: op.id, banner: role }, expectedFinalUtility: utilEv, expectedFinalScore: scoreEv, pImprove, tokensAfter: state.tokensRemaining - 1, assetAtRisk: `${role} banner`, confidence: current.confidence, status: 'evaluated' };
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
        if (nextTokens === 0)
            rows.push({ action: { kind: 'menu_reroll' }, expectedFinalUtility: stopUtility, expectedFinalScore: current.expected, tokensAfter: 0, assetAtRisk: 'last token; board preserved', confidence: current.confidence, status: 'evaluated', note: 'Fresh menu cannot be acted on with 0 tokens remaining.' });
        else {
            const rerollState = { ...state, tokensRemaining: nextTokens };
            const ev = expectedFreshMenuTerminalUtility(rerollState);
            rows.push({ action: { kind: 'menu_reroll' }, expectedFinalUtility: ev, expectedFinalScore: current.expected, tokensAfter: nextTokens, assetAtRisk: '1 token; board preserved', confidence: current.confidence, status: 'evaluated', note: `Fresh menu is a uniform draw of 3 distinct actions from 20 (${TOTAL_UNIFORM_MENUS.toLocaleString()} equally likely menus).` });
        }
    }
    const ranking = rows.sort((a, b) => b.expectedFinalUtility - a.expectedFinalUtility);
    return { current, ranking, recommendation: ranking[0], futureMenuMode: usingOverrideMenus ? 'override_samples' : 'known_uniform' };
}
//# sourceMappingURL=optimizer.js.map