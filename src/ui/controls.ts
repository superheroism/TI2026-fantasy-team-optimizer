import type { BoardLayoutId, OptimizerState, Role, StatisticalDatasetId, StatName, TraitName } from '../domain/types.js';
import { ACTION_BY_ID, cloneAction } from '../data/actionCatalog.js';
import type { ApplicationState } from './state.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;

export interface DynamicControlCallbacks {
  renderStructure: () => void;
  teamChanged: (role: Role) => void;
  reviewFieldEdited: (path: string) => void;
}

export function bindDynamicControls(state: ApplicationState, callbacks: DynamicControlCallbacks): void {
  document.querySelectorAll<HTMLSelectElement>('.emblem [data-field]').forEach(input => input.addEventListener('change', () => {
    const emblem = input.closest<HTMLElement>('.emblem');
    if (!emblem) return;
    const role = emblem.dataset.role as Role;
    const index = Number(emblem.dataset.index);
    const field = input.dataset.field;
    state.mutateBoard(board => {
      const target = board[role].emblems[index];
      if (!target) return;
      if (field === 'stat') target.stat = input.value as StatName;
      else if (field === 'qualityTier') target.qualityTier = Number(input.value) as 1 | 2 | 3 | 4 | 5;
      else if (field === 'trait') target.trait = input.value as TraitName;
    }, false);
    if (field) callbacks.reviewFieldEdited(`banners.${role}.emblems.${index}.${field}`);
    callbacks.renderStructure();
  }));

  document.querySelectorAll<HTMLInputElement>('.series').forEach(input => input.addEventListener('change', () => {
    const role = input.dataset.role as Role;
    state.setExpectedSeries(role,Math.max(1,Number(input.value)||1));
    callbacks.renderStructure();
  }));

  document.querySelectorAll<HTMLSelectElement>('.team-select').forEach(input => input.addEventListener('change', () => {
    const role = input.dataset.role as Role;
    state.mutateBoard(board => { board[role].selectedTeam = input.value; }, true);
    callbacks.reviewFieldEdited(`banners.${role}.selectedTeam`);
    callbacks.renderStructure();
    callbacks.teamChanged(role);
  }));

  document.querySelectorAll<HTMLElement>('.op-card').forEach(card => card.querySelectorAll<HTMLSelectElement>('[data-opfield="action"]').forEach(input => input.addEventListener('change', () => {
    const index = Number(card.dataset.op);
    const next = ACTION_BY_ID.get(input.value);
    if (!next) return;
    state.replaceMenuOperation(index, cloneAction(next), true);
    callbacks.reviewFieldEdited(`operationIds.${index}`);
    callbacks.renderStructure();
  })));
}

export interface StaticControlCallbacks {
  optimize: () => void;
  nextRoll: () => void;
  reset: () => void;
  layoutChanged: () => void;
  datasetChanged: (datasetId:StatisticalDatasetId) => void;
  themeChanged: (theme: 'dark' | 'light') => void;
  reviewFieldEdited: (path: string) => void;
}

export function bindStaticControls(state: ApplicationState, callbacks: StaticControlCallbacks): void {
  $<HTMLInputElement>('#tokens').addEventListener('change', input => {
    state.updateControls({ tokensRemaining: Number((input.currentTarget as HTMLInputElement).value) || 0 }, true);
    callbacks.reviewFieldEdited('tokensRemaining');
  });
  $<HTMLInputElement>('#username').addEventListener('change', input => state.updateControls({ username: (input.currentTarget as HTMLInputElement).value }, true));
  $<HTMLInputElement>('#target').addEventListener('change', input => state.updateControls({ targetScore: Number((input.currentTarget as HTMLInputElement).value) || 0 }, true));
  $<HTMLSelectElement>('#objective').addEventListener('change', input => state.updateControls({ objective: (input.currentTarget as HTMLSelectElement).value as OptimizerState['objective'] }, true));
  $<HTMLSelectElement>('#data-source').addEventListener('change', input => {
    const datasetId=(input.currentTarget as HTMLSelectElement).value as StatisticalDatasetId;
    if(state.setStatisticalDataset(datasetId))callbacks.datasetChanged(datasetId);
  });
  $('#optimize').addEventListener('click', callbacks.optimize);
  $('#next-roll').addEventListener('click', callbacks.nextRoll);
  $('#reset').addEventListener('click', callbacks.reset);
  document.querySelectorAll<HTMLButtonElement>('[data-layout-slots]').forEach(button => button.addEventListener('click', () => {
    const target: BoardLayoutId = button.dataset.layoutSlots === '5' ? 'expanded_5' : 'legacy_3';
    if (state.changeLayout(target)) callbacks.layoutChanged();
  }));
  $<HTMLInputElement>('#theme-toggle').addEventListener('change', event => callbacks.themeChanged((event.currentTarget as HTMLInputElement).checked ? 'dark' : 'light'));
}

export function reflectTokens(tokensRemaining: number): void {
  $<HTMLInputElement>('#tokens').value = String(tokensRemaining);
}

export function reflectStatisticalDataset(datasetId:StatisticalDatasetId):void {
  $<HTMLSelectElement>('#data-source').value=datasetId;
}

export function updateLayoutToggle(state: ApplicationState, resolvedLayoutId: (board: ApplicationState['board']) => BoardLayoutId): void {
  const current = resolvedLayoutId(state.board);
  document.querySelectorAll<HTMLButtonElement>('[data-layout-slots]').forEach(button => {
    const active = (button.dataset.layoutSlots === '5' ? 'expanded_5' : 'legacy_3') === current;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
