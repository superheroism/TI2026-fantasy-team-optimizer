import { ACTION_CATALOG } from '../data/actionCatalog.js';
import { applyRecommendationHighlights, clearRecommendationHighlights, escapeHtml, UI_ROLES } from './boardView.js';
const $ = (selector) => document.querySelector(selector);
const fmt = (value) => Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
const pct = (value) => value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;
export function renderOperationEditors(menu) {
    return menu.map((operation, index) => {
        const selectedElsewhere = new Set(menu.filter((_, other) => other !== index).map(item => item.id));
        const options = ACTION_CATALOG.map(action => `<option value="${action.id}" ${action.id === operation.id ? 'selected' : ''} ${selectedElsewhere.has(action.id) ? 'disabled' : ''}>${escapeHtml(action.label)}</option>`).join('');
        return `<article class="op-card" data-op="${index}"><div class="op-card-head"><span class="op-number">${index + 1}</span><div><select class="op-select" data-opfield="action" aria-label="Action ${index + 1}">${options}</select></div><span class="op-recommended" aria-hidden="true">RECOMMENDED</span></div><div class="op-results" data-opresult="${index}"><div class="op-empty">Run the optimizer to compare legal targets and reroll outcomes.</div></div></article>`;
    }).join('');
}
export function utilityDeltaText(delta, targetMode) {
    return targetMode ? `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp` : `${delta >= 0 ? '+' : ''}${fmt(delta)}`;
}
export function utilityText(value, targetMode) {
    return targetMode ? pct(value) : fmt(value);
}
function boardRowsForOperation(result, operationId) {
    return result.ranking.filter((row) => row.action.kind === 'board_action' && row.action.operationId === operationId && row.status === 'evaluated');
}
function rangePosition(value, min, max) {
    return max <= min ? 50 : Math.max(0, Math.min(100, (value - min) / (max - min) * 100));
}
function rangeLaneLabel(key, position, label, value) {
    const edge = position < 8 ? 'edge-left' : position > 92 ? 'edge-right' : '';
    return `<span class="range-marker-label ${key} ${edge}" style="left:${position.toFixed(2)}%"><small>${label}</small><b>${value}</b></span>`;
}
export function confidenceExplanation(level) {
    if (level === 'high')
        return 'High confidence means the modeled action advantage is robust within the available transition and score model. Normal uncertainty in future match performance still applies.';
    if (level === 'low')
        return 'Low confidence means the recommendation is unusually sensitive to missing data, approximation, or model assumptions. Treat close alternatives as effectively tied.';
    return 'Medium confidence reflects the V1 distribution-aware proxy: empirical team/role stat distributions and cross-stat correlations are modeled, while exact player-game covariance, tournament path, and long-horizon continuation beyond the browser lookahead remain approximations.';
}
export function renderActionResults(options) {
    const { result, state, board, menu, targetSelection, onTargetSelectionChanged } = options;
    const targetMode = state.objective === 'target_probability';
    const stopUtility = targetMode ? (result.current.targetProbability ?? 0) : result.current.expected;
    const allBoardRows = result.ranking.filter(row => row.action.kind === 'board_action' && row.status === 'evaluated');
    const rangeValues = [0];
    for (const row of allBoardRows) {
        for (const value of [row.outcomeP10Utility, row.outcomeMedianUtility, row.outcomeP90Utility, row.expectedFinalUtility]) {
            if (value !== undefined)
                rangeValues.push(value - stopUtility);
        }
    }
    let rangeMin = Math.min(...rangeValues);
    let rangeMax = Math.max(...rangeValues);
    const rawSpan = Math.max(rangeMax - rangeMin, targetMode ? .01 : 100);
    const padding = rawSpan * .08;
    rangeMin -= padding;
    rangeMax += padding;
    const recommended = result.recommendation.action.kind === 'board_action' ? result.recommendation.action : null;
    menu.forEach((operation, index) => {
        const card = document.querySelector(`.op-card[data-op="${index}"]`);
        const resultElement = document.querySelector(`[data-opresult="${index}"]`);
        if (!card || !resultElement)
            return;
        const rows = boardRowsForOperation(result, operation.id).sort((a, b) => b.expectedFinalUtility - a.expectedFinalUtility);
        card.classList.remove('recommended');
        if (!rows.length) {
            resultElement.innerHTML = '<div class="op-empty">No legal banner target for this action on the current board.</div>';
            return;
        }
        const best = rows[0];
        const legalRoles = rows.map(row => row.action.kind === 'board_action' ? row.action.banner : 'core');
        let selectedRole = targetSelection.get(index);
        if (!selectedRole || !legalRoles.includes(selectedRole))
            selectedRole = best.action.kind === 'board_action' ? best.action.banner : legalRoles[0];
        targetSelection.set(index, selectedRole);
        const row = rows.find(candidate => candidate.action.kind === 'board_action' && candidate.action.banner === selectedRole) ?? best;
        const isRecommended = Boolean(recommended && recommended.operationId === operation.id);
        if (isRecommended)
            card.classList.add('recommended');
        const bestRole = best.action.kind === 'board_action' ? best.action.banner : 'core';
        const selected = row.action.kind === 'board_action' ? row.action.banner : bestRole;
        const delta = row.expectedFinalUtility - stopUtility;
        const p10 = (row.outcomeP10Utility ?? row.expectedFinalUtility) - stopUtility;
        const medianValue = (row.outcomeMedianUtility ?? row.expectedFinalUtility) - stopUtility;
        const p90 = (row.outcomeP90Utility ?? row.expectedFinalUtility) - stopUtility;
        const zero = rangePosition(0, rangeMin, rangeMax);
        const left = rangePosition(p10, rangeMin, rangeMax);
        const right = rangePosition(p90, rangeMin, rangeMax);
        const median = rangePosition(medianValue, rangeMin, rangeMax);
        const expected = rangePosition(delta, rangeMin, rangeMax);
        const topLane = rangeLaneLabel('p10', left, 'P10', utilityDeltaText(p10, targetMode)) + rangeLaneLabel('p90', right, 'P90', utilityDeltaText(p90, targetMode));
        const medianLane = rangeLaneLabel('median', median, 'MEDIAN', utilityDeltaText(medianValue, targetMode));
        const expectedLane = rangeLaneLabel('expected', expected, 'EXPECTED', utilityDeltaText(delta, targetMode));
        resultElement.innerHTML = `<div class="op-target-line"><span>BEST TARGET: <b>${bestRole.toUpperCase()}</b></span></div>
      <div class="target-tabs">${UI_ROLES.map(role => `<button data-action-target="${index}:${role}" ${legalRoles.includes(role) ? '' : 'disabled'} class="${role === selected ? 'active' : ''}">${role.toUpperCase()}</button>`).join('')}</div>
      <div class="op-metrics"><div class="metric-final"><span>${targetMode ? 'TARGET PROB.' : 'EXPECTED FINAL'}</span><b>${utilityText(row.expectedFinalUtility, targetMode)}</b></div><div class="metric-delta"><span>Δ VS STOP</span><b class="${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'zero'}">${utilityDeltaText(delta, targetMode)}</b></div><div class="metric-prob"><span>P(IMPROVE)</span><b>${row.pImprove === undefined ? '—' : `${(row.pImprove * 100).toFixed(0)}%`}</b></div></div>
      <div class="op-range"><div class="op-range-head"><span>MODELED REROLL / CONTINUATION OUTCOME Δ VS STOP</span></div><div class="action-range-diagram" title="0 = current setup · P10 ${utilityDeltaText(p10, targetMode)} · Median ${utilityDeltaText(medianValue, targetMode)} · Expected ${utilityDeltaText(delta, targetMode)} · P90 ${utilityDeltaText(p90, targetMode)}"><div class="range-label-lanes"><div class="range-label-lane range-top-lane">${topLane}</div><div class="range-label-lane range-middle-lane">${medianLane}</div><div class="range-label-lane range-lower-lane">${expectedLane}</div></div><div class="action-range-track"><i class="action-zero" style="left:${zero.toFixed(2)}%"></i><i class="action-range" style="left:${Math.min(left, right).toFixed(2)}%;width:${Math.max(.8, Math.abs(right - left)).toFixed(2)}%"></i><i class="action-p10" style="left:${left.toFixed(2)}%"></i><i class="action-p90" style="left:${right.toFixed(2)}%"></i><i class="action-median" style="left:${median.toFixed(2)}%"></i><i class="action-expected" style="left:${expected.toFixed(2)}%"></i></div><div class="range-bottom"><span class="range-worse">WORSE</span><span class="range-zero" style="left:${zero.toFixed(2)}%">0</span><span class="range-better">BETTER</span></div></div></div>`;
    });
    document.querySelectorAll('[data-action-target]').forEach(button => button.addEventListener('click', () => {
        const [indexText, role] = button.dataset.actionTarget.split(':');
        targetSelection.set(Number(indexText), role);
        onTargetSelectionChanged();
    }));
    applyRecommendationHighlights(result, board);
}
export function clearActionResults(targetSelection, message = 'Run the optimizer to compare legal targets and reroll outcomes.') {
    targetSelection.clear();
    document.querySelectorAll('.op-card').forEach(card => card.classList.remove('recommended'));
    document.querySelectorAll('.op-results').forEach(element => element.innerHTML = `<div class="op-empty">${escapeHtml(message)}</div>`);
    $('#menu-option')?.classList.remove('recommended');
    $('#stop-option')?.classList.remove('recommended');
    clearRecommendationHighlights();
    const next = document.querySelector('#next-roll');
    if (next)
        next.disabled = true;
}
//# sourceMappingURL=actionView.js.map