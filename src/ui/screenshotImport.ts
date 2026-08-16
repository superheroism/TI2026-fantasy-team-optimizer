import type { DataBundle, Role } from '../domain/types.js';
import { displayTeamName } from '../data/ti2026Rosters.js';
import { escapeHtml } from './boardView.js';
import type { ApplicationState } from './state.js';
import { requestScreenshotImport, validateScreenshotImport, type ValidatedScreenshotImport } from '../import/screenshotImport.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;

export interface ScreenshotImportCallbacks {
  getData: () => DataBundle | undefined;
  renderStructure: () => void;
  afterApply: () => void;
}

function formatRole(role: Role): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function renderReview(result: ValidatedScreenshotImport): string {
  const roleHtml = ROLES.map(role => {
    const banner = result.board[role];
    return `<section class="screenshot-review-role"><h4>${formatRole(role)} · ${escapeHtml(displayTeamName(banner.selectedTeam))}</h4><div>${banner.emblems.map((emblem, index) => `<span class="screenshot-review-emblem ${emblem.color}"><b>${index + 1}. ${escapeHtml(emblem.stat)}</b><small>Tier ${emblem.qualityTier} · ${escapeHtml(emblem.trait)}</small></span>`).join('')}</div></section>`;
  }).join('');
  const actions = result.menu.map((action, index) => `<li><b>${index + 1}</b> ${escapeHtml(action.label)}</li>`).join('');
  const warnings = [
    ...result.warnings,
    ...result.lowConfidenceFields.map(field => `${field.path}: ${Math.round(field.confidence * 100)}% confidence`),
  ];
  return `${roleHtml}<section class="screenshot-review-menu"><h4>Available actions</h4><ol>${actions}</ol>${result.tokensRemaining === undefined ? '' : `<p>Roll tokens: <b>${result.tokensRemaining}</b></p>`}</section>${warnings.length ? `<section class="screenshot-review-warnings"><h4>Review before applying</h4><ul>${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>` : ''}`;
}

function setStatus(text: string, kind: 'idle' | 'working' | 'success' | 'error' = 'idle'): void {
  const status = $('#screenshot-import-status');
  status.textContent = text;
  status.dataset.kind = kind;
}

export function bindScreenshotImport(state: ApplicationState, callbacks: ScreenshotImportCallbacks): void {
  const button = $<HTMLButtonElement>('#screenshot-import');
  const input = $<HTMLInputElement>('#screenshot-file');
  const dialog = $<HTMLDialogElement>('#screenshot-review-dialog');
  const reviewBody = $('#screenshot-review-body');
  const apply = $<HTMLButtonElement>('#screenshot-review-apply');
  const cancel = $<HTMLButtonElement>('#screenshot-review-cancel');
  let pending: ValidatedScreenshotImport | null = null;

  const applyImport = (result: ValidatedScreenshotImport): void => {
    state.importScreenshot(result.board, result.menu, result.tokensRemaining);
    callbacks.renderStructure();
    callbacks.afterApply();
    setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions.`, 'success');
  };

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const data = callbacks.getData();
    if (!data) {
      setStatus('Tournament model is still loading.', 'error');
      return;
    }
    button.disabled = true;
    button.textContent = 'Reading Screenshot…';
    setStatus('Reading board, teams, emblems, and available actions…', 'working');
    try {
      const raw = await requestScreenshotImport(file, data);
      const result = validateScreenshotImport(raw, data, state.board);
      if (!result.requiresReview) {
        applyImport(result);
        return;
      }
      pending = result;
      reviewBody.innerHTML = renderReview(result);
      dialog.showModal();
      setStatus('Screenshot parsed; review the flagged fields before applying.', 'idle');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Import Screenshot';
    }
  });

  apply.addEventListener('click', () => {
    if (!pending) return;
    applyImport(pending);
    pending = null;
    dialog.close();
  });
  cancel.addEventListener('click', () => {
    pending = null;
    dialog.close();
    setStatus('Screenshot import cancelled.', 'idle');
  });
  dialog.addEventListener('cancel', () => {
    pending = null;
    setStatus('Screenshot import cancelled.', 'idle');
  });
}
