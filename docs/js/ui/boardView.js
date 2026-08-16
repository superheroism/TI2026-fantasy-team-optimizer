import { legalStats } from '../domain/rules.js';
import { evaluateBanner } from '../domain/bannerEvaluator.js';
import { ACTION_BY_ID } from '../data/actionCatalog.js';
import { attachedPlayers, displayTeamName } from '../data/ti2026Rosters.js';
export const UI_ROLES = ['core', 'mid', 'support'];
const TRAITS = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
export function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function attachedPlayerLabel(team, role) {
    const players = attachedPlayers(team, role);
    return players.length ? players.join(' + ') : 'Roster names unavailable';
}
function teamOptions(role, selected, data) {
    return data.players
        .filter(player => player.role === role)
        .sort((a, b) => displayTeamName(a.team).localeCompare(displayTeamName(b.team)))
        .map(player => `<option value="${escapeHtml(player.team)}" ${player.team === selected ? 'selected' : ''}>${escapeHtml(displayTeamName(player.team))}</option>`)
        .join('');
}
function signedPct(value) {
    return `${value >= 0 ? '+' : ''}${value}%`;
}
function emblemCard(role, banner, index) {
    const emblem = banner.emblems[index];
    const derived = evaluateBanner(banner)[index];
    if (!emblem || !derived)
        throw new RangeError(`Banner ${role} has no slot ${index}.`);
    const pool = legalStats(emblem.color);
    const effects = derived.effects.length
        ? derived.effects.map(effect => `${effect.trait} ${signedPct(effect.modifierPct)}${effect.sourcePosition === index ? '' : ` from slot ${effect.sourcePosition + 1}`}`).join(' · ')
        : 'No active trait modifier on this slot';
    return `<div class="emblem ${emblem.color}" data-role="${role}" data-index="${index}">
    <div class="client-row client-row-stat" data-element="stat">
      <span class="client-kind">STAT</span>
      <select class="client-select stat-select" data-field="stat" aria-label="Slot ${index + 1} stat">${pool.map(stat => `<option ${stat === emblem.stat ? 'selected' : ''}>${stat}</option>`).join('')}</select>
      <strong class="client-total" title="Effective multiplier calculated from quality and all active trait effects">${derived.effectiveMultiplierPct}%</strong>
    </div>
    <div class="client-divider"></div>
    <div class="client-row" data-element="quality">
      <span class="client-kind">TIER</span>
      <select class="client-select" data-field="qualityTier" aria-label="Slot ${index + 1} quality">${[1, 2, 3, 4, 5].map(tier => `<option value="${tier}" ${tier === emblem.qualityTier ? 'selected' : ''}>${['I', 'II', 'III', 'IV', 'V'][tier - 1]}</option>`).join('')}</select>
      <strong class="client-bonus">+${derived.tierBonusPct}%</strong>
    </div>
    <div class="client-row" data-element="trait" title="${escapeHtml(effects)}">
      <span class="client-kind">TRAIT</span>
      <select class="client-select" data-field="trait" aria-label="Slot ${index + 1} trait">${TRAITS.map(trait => `<option value="${trait}" ${trait === emblem.trait ? 'selected' : ''}>${trait}</option>`).join('')}</select>
      <strong class="client-bonus">${signedPct(derived.traitModifierPct)}</strong>
    </div>
  </div>`;
}
function bannerColumn(role, board, data) {
    const banner = board[role];
    const players = attachedPlayerLabel(banner.selectedTeam, role);
    return `<section class="banner" data-banner-role="${role}"><div class="banner-head"><div class="role-heading"><span>${role.toUpperCase()}</span><small>${role === 'mid' ? 'position 2' : 'fixed same-team pair'}</small></div><label class="series-control">EXPECTED SERIES<input class="series" data-role="${role}" type="number" min="1" max="8" value="${banner.expectedSeries}"></label></div>
    <div class="team-picker"><label>TEAM<select class="team-select" data-role="${role}">${teamOptions(role, banner.selectedTeam, data)}</select></label><div class="attached-players"><span>ATTACHED PLAYER${role === 'mid' ? '' : 'S'}</span><b>${escapeHtml(players)}</b></div></div>
    <div class="emblems">${banner.emblems.map((_, index) => emblemCard(role, banner, index)).join('')}</div><div id="selected-${role}" class="roster"><span>MODELED RETAINED ROLE</span><b>Run Optimizer to refresh</b></div></section>`;
}
export function renderBoardHtml(board, data) {
    return UI_ROLES.map(role => bannerColumn(role, board, data)).join('');
}
function affectedIndices(board, role, operation) {
    if (!('color' in operation))
        return board[role].emblems.map((_, index) => index);
    const matches = board[role].emblems.map((emblem, index) => emblem.color === operation.color ? index : -1).filter(index => index >= 0);
    if (operation.scope === 'first_matching')
        return matches.length ? [matches[0]] : [];
    if (operation.scope === 'last_matching')
        return matches.length ? [matches[matches.length - 1]] : [];
    return matches;
}
export function clearRecommendationHighlights(root = document) {
    root.querySelectorAll('.banner.recommended-target').forEach(element => element.classList.remove('recommended-target'));
    root.querySelectorAll('.emblem.recommended-target-emblem').forEach(element => element.classList.remove('recommended-target-emblem'));
    root.querySelectorAll('.client-row.recommended-target-element').forEach(element => element.classList.remove('recommended-target-element'));
}
export function clearScreenshotReviewHighlights(root = document) {
    root.querySelectorAll('.emblem.screenshot-review-target-emblem').forEach(element => element.classList.remove('screenshot-review-target-emblem'));
    root.querySelectorAll('.team-select.screenshot-review-target-team').forEach(element => element.classList.remove('screenshot-review-target-team'));
}
export function applyScreenshotReviewHighlights(paths) {
    clearScreenshotReviewHighlights();
    for (const path of paths) {
        const role = UI_ROLES.find(candidate => path === candidate || path.startsWith(`${candidate}.`) || path.startsWith(`banners.${candidate}.`));
        if (!role)
            continue;
        const banner = document.querySelector(`.banner[data-banner-role="${role}"]`);
        if (!banner)
            continue;
        if (path === `banners.${role}.selectedTeam`) {
            banner.querySelector(`.team-select[data-role="${role}"]`)?.classList.add('screenshot-review-target-team');
            continue;
        }
        const match = path.match(/emblems\.(\d+)/) ?? path.match(/emblems\[(\d+)\]/);
        if (!match)
            continue;
        const index = Number(match[1]);
        if (!Number.isInteger(index))
            continue;
        banner.querySelector(`.emblem[data-index="${index}"]`)?.classList.add('screenshot-review-target-emblem');
    }
}
export function applyRecommendationHighlights(result, board) {
    clearRecommendationHighlights();
    const action = result.recommendation.action;
    if (action.kind !== 'board_action')
        return;
    const banner = document.querySelector(`.banner[data-banner-role="${action.banner}"]`);
    if (!banner)
        return;
    banner.classList.add('recommended-target');
    const operation = ACTION_BY_ID.get(action.operationId);
    if (!operation)
        return;
    const element = operation.kind === 'stat_reroll' ? 'stat' : operation.kind === 'trait_reroll' ? 'trait' : 'quality';
    for (const index of affectedIndices(board, action.banner, operation)) {
        const emblem = banner.querySelector(`.emblem[data-index="${index}"]`);
        emblem?.classList.add('recommended-target-emblem');
        emblem?.querySelector(`.client-row[data-element="${element}"]`)?.classList.add('recommended-target-element');
    }
}
//# sourceMappingURL=boardView.js.map