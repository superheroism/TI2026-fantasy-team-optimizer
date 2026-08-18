import type { DataBundle, OptimizerState, RecommendationResult, Role, StatisticalDatasetId } from '../domain/types.js';
import { resolvedLayoutId } from '../data/defaultState.js';
import { DEFAULT_STATISTICAL_DATASET_ID, STATISTICAL_DATASETS, loadStatisticalModel } from '../data/statisticalModel.js';
import { displayTeamName, rosterForTeam } from '../data/ti2026Rosters.js';
import { formatAction } from '../engine/actionUtils.js';
import { evaluateSelectedBoard } from '../engine/scoring.js';
import { OptimizerRequestCancelledError, OptimizerWorkerClient } from './optimizerClient.js';
import { ApplicationState } from './state.js';
import { attachedPlayerLabel, escapeHtml, renderBoardHtml, UI_ROLES } from './boardView.js';
import { clearActionResults, renderActionResults, renderOperationEditors, utilityDeltaText, utilityText } from './actionView.js';
import { clearHistogram, drawHistogram, renderComparisonTabs, renderTeamComparison } from './plots.js';
import { bindDynamicControls, bindStaticControls, reflectStatisticalDataset, reflectTokens, updateLayoutToggle } from './controls.js';
import { bindScreenshotImport, discardScreenshotReviewState, renderActiveScreenshotReviewHighlights, resolveScreenshotReviewPath } from './screenshotImport.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const fmt = (value: number): string => Number.isFinite(value) ? Math.round(value).toLocaleString() : '—';
const pct = (value: number | undefined): string => value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

const appState = new ApplicationState();
const optimizerClient = new OptimizerWorkerClient();
const actionTargetSelection = new Map<number, Role>();
let data:DataBundle|undefined;
let dataLoadSequence=0;
let lastResult: RecommendationResult | null = null;
let lastOptimizerState: OptimizerState | null = null;

function clearResultState(message?: string): void {
  lastResult = null;
  lastOptimizerState = null;
  clearActionResults(actionTargetSelection, message);
}

function invalidateOptimizerPresentation(preserveComparison: boolean): void {
  optimizerClient.invalidate();
  $('#calc-status').textContent = 'Setup changed — Run Optimizer to refresh the selected setup';
  $('#rec-action').textContent = 'Setup changed';
  $('#rec-note').textContent = 'Run Optimizer to refresh the score distribution and evaluate the next move.';
  $('#menu-ev').textContent = '—';
  $('#menu-delta').textContent = '—';
  $('#stop-ev').textContent = '—';
  clearResultState();
  $('#ranking').innerHTML = '<div class="ranking-empty">Setup changed — run the optimizer again to refresh the full decision ranking.</div>';
  if (!preserveComparison) $('#team-comparisons').innerHTML = '<div class="loading-inline">Banner setup changed — run the optimizer to refresh this team comparison.</div>';
}

appState.setInvalidator(event => invalidateOptimizerPresentation(event.preserveComparison));

function renderComparison(): void {
  if (!data) return;
  renderTeamComparison(appState.comparisonRole, appState.board, data);
  renderComparisonTabs(appState.comparisonRole, role => {
    appState.setComparisonRole(role);
    renderComparison();
  });
}

function renderStructure(): void {
  if(!data)return;
  $('#board').innerHTML = renderBoardHtml(appState.board, data);
  $('#ops').innerHTML = renderOperationEditors(appState.menu);
  updateLayoutToggle(appState, resolvedLayoutId);
  renderComparisonTabs(appState.comparisonRole, role => {
    appState.setComparisonRole(role);
    renderComparison();
  });
  bindDynamicControls(appState, {
    renderStructure,
    teamChanged: role => {
      if (appState.comparisonRole === role) renderComparison();
    },
    reviewFieldEdited: resolveScreenshotReviewPath,
  });
  renderActiveScreenshotReviewHighlights();
}

function equivalentTeam(sourceTeam: string, role: Role): string | undefined {
  if(!data)return undefined;
  const target = rosterForTeam(sourceTeam)?.canonical;
  if (!target) return data.players.find(player => player.role === role && player.team === sourceTeam)?.team;
  return data.players.find(player => player.role === role && rosterForTeam(player.team)?.canonical === target)?.team;
}

function normalizeSelectedTeams(): void {
  if(!data)return;
  for (const role of UI_ROLES) {
    const current = appState.board[role].selectedTeam;
    appState.board[role].selectedTeam = equivalentTeam(current, role) ?? data.players.find(player => player.role === role)?.team ?? current;
  }
}

function applyTheme(next: 'dark' | 'light', recalculate = false): void {
  appState.setTheme(next);
  document.body.dataset.theme = next;
  try { localStorage.setItem('dota2-fantasy-theme', next); } catch {}
  const toggle = document.querySelector<HTMLInputElement>('#theme-toggle');
  if (toggle) {
    toggle.checked = next === 'dark';
    toggle.setAttribute('aria-checked', next === 'dark' ? 'true' : 'false');
    toggle.setAttribute('aria-label', next === 'dark' ? 'Dark Theme on' : 'Dark Theme off');
  }
  if (recalculate && data) void runSelected(true);
}

function runSelected(refreshComparison = true): Promise<boolean> {
  if(!data)return Promise.resolve(false);
  const selectedData=data;
  const selectedDatasetId=appState.statisticalDatasetId;
  document.body.classList.add('busy');
  $('#calc-status').textContent = 'Calculating selected setup…';
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(() => {
    try {
      if(data!==selectedData||appState.statisticalDatasetId!==selectedDatasetId){resolve(false);return;}
      const selected = evaluateSelectedBoard(appState.board, appState.username, selectedData, appState.targetScore > 0 ? appState.targetScore : undefined);
      const finite = selected.samples.filter(Number.isFinite);
      if (finite.length !== selected.samples.length || !finite.some(value => value > 0)) throw new Error('The simulation produced no positive finite scores. The statistical model did not map correctly to the selected banner.');
      $('#score-expected').textContent = fmt(selected.expected);
      $('#score-median').textContent = fmt(selected.median);
      $('#score-range').textContent = `${fmt(selected.p10)} – ${fmt(selected.p90)}`;
      $('#score-target').textContent = appState.targetScore > 0 ? pct(selected.targetProbability) : '—';
      $('#target-metric').classList.toggle('inactive', appState.targetScore <= 0);
      $('#target-metric').setAttribute('aria-hidden', appState.targetScore <= 0 ? 'true' : 'false');
      const titlePrefix = selected.title.prefix?.label ?? '—';
      const titleSuffix = selected.title.suffix?.label ?? '—';
      $('#title-rec').innerHTML = `<span class="title-prefix">${escapeHtml(titlePrefix)}</span> <span class="title-user">${escapeHtml(appState.username || '[Username]')}</span> <span class="title-suffix" tabindex="0">the ${escapeHtml(titleSuffix)}<span class="title-tooltip">${escapeHtml(selected.title.suffixExplainer ?? '')}</span></span>`;
      $('#title-note').textContent = `Expected prefix gain ≈ ${fmt(selected.title.expectedBonus)} · Core +${selected.title.roleBoostPct.core.toFixed(1)}% · Mid +${selected.title.roleBoostPct.mid.toFixed(1)}% · Support +${selected.title.roleBoostPct.support.toFixed(1)}%`;
      for (const role of UI_ROLES) {
        const row = selected.roster[role][0];
        $(`#selected-${role}`).innerHTML = row ? `<span>MODELED RETAINED ROLE</span><b>${fmt(row.expected)}</b><small>${escapeHtml(displayTeamName(row.team))} · ${escapeHtml(attachedPlayerLabel(row.team, role))}</small>` : '<b>—</b>';
      }
      drawHistogram(selected.samples, appState.targetScore, selected.expected, selected.median, selected.p10, selected.p90);
      if (refreshComparison) renderComparison();
      $('#calc-status').textContent = `${selectedData.simulation.iterations.toLocaleString()} simulations · ${STATISTICAL_DATASETS[selectedDatasetId].label} · top 2 games in each series · best 1 series`;
      resolve(true);
    } catch (error) {
      $('#score-expected').textContent = '—';
      $('#score-median').textContent = '—';
      $('#score-range').textContent = '—';
      $('#score-target').textContent = '—';
      clearHistogram(`Simulation unavailable: ${String(error)}`);
      $('#calc-status').textContent = `Simulation error: ${String(error)}`;
      resolve(false);
    } finally {
      document.body.classList.remove('busy');
    }
  }, 0)));
}

function renderCurrentActionResults(): void {
  if (!lastResult || !lastOptimizerState) return;
  renderActionResults({
    result: lastResult,
    state: lastOptimizerState,
    board: appState.board,
    menu: appState.menu,
    targetSelection: actionTargetSelection,
    onTargetSelectionChanged: renderCurrentActionResults,
  });
}

async function runOptimizer(): Promise<void> {
  if(!data)return;
  const button = $<HTMLButtonElement>('#optimize');
  const started = performance.now();
  button.disabled = true;
  button.textContent = 'Recalculating…';
  $('#rec-action').textContent = 'Recalculating selected setup…';
  clearResultState('Calculating current setup…');
  try {
    const recalculated = await runSelected(false);
    if (!recalculated) {
      $('#rec-action').textContent = 'Optimization unavailable';
      $('#rec-note').textContent = 'Fix the selected-board simulation error before optimizing the next move.';
      return;
    }
    const state = appState.optimizerState();
    button.textContent = 'Optimizing…';
    $('#rec-action').textContent = 'Calculating all legal action targets…';
    await new Promise<void>(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
    const workerRun = await optimizerClient.optimize(state,appState.statisticalDatasetId);
    const result = workerRun.result;
    const recommendation = result.recommendation;
    const elapsed = performance.now() - started;
    const targetMode = state.objective === 'target_probability';
    const stopUtility = targetMode ? (result.current.targetProbability ?? 0) : result.current.expected;
    lastResult = result;
    lastOptimizerState = state;
    renderCurrentActionResults();
    $('#rec-action').textContent = formatAction(recommendation.action, state);
    $('#rec-note').textContent = `${recommendation.note ?? ''}${recommendation.note ? ' · ' : ''}Recalculated + optimized in ${elapsed < 1000 ? `${Math.round(elapsed)} ms` : `${(elapsed / 1000).toFixed(2)} s`}.`;
    const menuRow = result.ranking.find(row => row.action.kind === 'menu_reroll');
    const stopRow = result.ranking.find(row => row.action.kind === 'stop');
    $('#menu-ev').textContent = menuRow ? utilityText(menuRow.expectedFinalUtility, targetMode) : '—';
    $('#menu-delta').textContent = menuRow ? utilityDeltaText(menuRow.expectedFinalUtility - stopUtility, targetMode) : '—';
    $('#stop-ev').textContent = stopRow ? utilityText(stopRow.expectedFinalUtility, targetMode) : utilityText(stopUtility, targetMode);
    $('#menu-option').classList.toggle('recommended', recommendation.action.kind === 'menu_reroll');
    $('#stop-option').classList.toggle('recommended', recommendation.action.kind === 'stop');
    const next = $<HTMLButtonElement>('#next-roll');
    next.disabled = state.tokensRemaining <= 0;
    next.textContent = state.tokensRemaining > 0 ? 'Next Roll (-1 Token)' : 'No Tokens Remaining';
    const metricHead = targetMode ? 'P≥TARGET' : 'EXPECTED FINAL';
    const lastHead = targetMode ? 'P(OBJECTIVE ↑)' : 'P(BOARD EV ↑)';
    $('#ranking').innerHTML = `<div class="rank-head"><span>#</span><span>ACTION</span><span>${metricHead}</span><span>Δ VS STOP</span><span>${lastHead}</span><span>P10 Δ</span><span>P50 Δ</span><span>P90 Δ</span></div>${result.ranking.slice(0, 12).map((row, index) => {
      const metric = utilityText(row.expectedFinalUtility, targetMode);
      const delta = row.expectedFinalUtility - stopUtility;
      const deltaText = utilityDeltaText(delta, targetMode);
      const last = row.pImprove !== undefined ? `${(row.pImprove * 100).toFixed(0)}%` : row.confidence.toUpperCase();
      const p10 = (row.outcomeP10Utility ?? row.expectedFinalUtility) - stopUtility;
      const p50 = (row.outcomeMedianUtility ?? row.expectedFinalUtility) - stopUtility;
      const p90 = (row.outcomeP90Utility ?? row.expectedFinalUtility) - stopUtility;
      return `<div class="rank-row ${index === 0 ? 'best' : ''}"><i>${index + 1}</i><div><b>${formatAction(row.action, state)}</b><small>${row.status.replaceAll('_', ' ')}${row.note ? ` · ${row.note}` : ''}</small></div><strong>${row.status === 'evaluated' ? metric : '—'}</strong><strong class="rank-delta ${delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'zero'}">${row.status === 'evaluated' ? deltaText : '—'}</strong><span>${last}</span><strong class="rank-quantile ${p10 > 0 ? 'positive' : p10 < 0 ? 'negative' : 'zero'}">${row.status === 'evaluated' ? utilityDeltaText(p10, targetMode) : '—'}</strong><strong class="rank-quantile ${p50 > 0 ? 'positive' : p50 < 0 ? 'negative' : 'zero'}">${row.status === 'evaluated' ? utilityDeltaText(p50, targetMode) : '—'}</strong><strong class="rank-quantile ${p90 > 0 ? 'positive' : p90 < 0 ? 'negative' : 'zero'}">${row.status === 'evaluated' ? utilityDeltaText(p90, targetMode) : '—'}</strong></div>`;
    }).join('')}`;
    requestAnimationFrame(() => setTimeout(renderComparison, 0));
  } catch (error) {
    if (error instanceof OptimizerRequestCancelledError) return;
    $('#rec-action').textContent = 'Optimization error';
    $('#rec-note').textContent = String(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Run Optimizer';
  }
}

function advanceToNextRoll(): void {
  if (!appState.advanceRoll()) return;
  reflectTokens(appState.tokensRemaining);
  $('#rec-action').textContent = 'Enter the realized board + new three actions';
  $('#rec-note').textContent = 'One roll token was deducted. Update the changed banner, replace the three offers with the new in-game menu, then run the optimizer again.';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetBoard(): void {
  discardScreenshotReviewState('Board reset. Screenshot review cleared.');
  appState.resetBoard();
  reflectTokens(appState.tokensRemaining);
  if (!data) return;
  normalizeSelectedTeams();
  renderStructure();
  void runSelected();
}

async function loadDataset(datasetId:StatisticalDatasetId):Promise<void>{
  const sequence=++dataLoadSequence;
  data=undefined;
  optimizerClient.invalidate();
  clearResultState('Loading statistical dataset…');
  $('#board').innerHTML = `<section class="loading-panel"><b>Loading ${escapeHtml(STATISTICAL_DATASETS[datasetId].label)}…</b><small>Loading team/role distributions and attached rosters.</small></section>`;
  $('#ops').innerHTML = '<div class="loading-inline">Operations will appear after the tournament model loads.</div>';
  $('#calc-status').textContent = `Loading ${STATISTICAL_DATASETS[datasetId].label}…`;
  try{
    const bundle=await loadStatisticalModel(datasetId);
    if(sequence!==dataLoadSequence||appState.statisticalDatasetId!==datasetId)return;
    data=bundle;
    try{localStorage.setItem('dota2-fantasy-data-source',datasetId);}catch{}
    reflectStatisticalDataset(datasetId);
    normalizeSelectedTeams();
    renderStructure();
    void runSelected();
  }catch(error){
    if(sequence!==dataLoadSequence)return;
    $('#board').innerHTML = '<section class="loading-panel error"><b>Tournament model could not be loaded.</b><small>Refresh the page or choose the other statistical dataset. No synthetic scoring data are being substituted.</small></section>';
    $('#ops').innerHTML = '';
    $('#calc-status').textContent = `Tournament model load failed: ${String(error)}`;
  }
}

export function mount(): void {
  try {
    const saved = localStorage.getItem('dota2-fantasy-theme');
    if (saved === 'light' || saved === 'dark') appState.setTheme(saved);
    const savedDataset=localStorage.getItem('dota2-fantasy-data-source') as StatisticalDatasetId|null;
    if(savedDataset&&STATISTICAL_DATASETS[savedDataset])appState.statisticalDatasetId=savedDataset;
  } catch {}
  if(!STATISTICAL_DATASETS[appState.statisticalDatasetId])appState.statisticalDatasetId=DEFAULT_STATISTICAL_DATASET_ID;
  applyTheme(appState.theme, false);
  reflectStatisticalDataset(appState.statisticalDatasetId);
  $('#board').innerHTML = '<section class="loading-panel"><b>Loading tournament model…</b><small>Loading team/role distributions and attached rosters.</small></section>';
  $('#ops').innerHTML = '<div class="loading-inline">Operations will appear after the tournament model loads.</div>';
  $('#calc-status').textContent = 'Loading tournament model…';
  bindStaticControls(appState, {
    optimize: () => { if (data) void runOptimizer(); },
    nextRoll: () => { if (data) advanceToNextRoll(); },
    reset: resetBoard,
    layoutChanged: () => {
      discardScreenshotReviewState('Layout changed. Screenshot review cleared.');
      if (data) renderStructure();
    },
    datasetChanged: datasetId => { void loadDataset(datasetId); },
    themeChanged: theme => applyTheme(theme, true),
    reviewFieldEdited: resolveScreenshotReviewPath,
  });
  bindScreenshotImport(appState, {
    getData: () => data,
    renderStructure,
    afterApply: () => {
      reflectTokens(appState.tokensRemaining);
      normalizeSelectedTeams();
      renderStructure();
      void runSelected();
    },
  });
  void loadDataset(appState.statisticalDatasetId);
}
