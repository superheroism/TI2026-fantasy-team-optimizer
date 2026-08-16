import type { DataBundle } from '../domain/types.js';
import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import type { ApplicationState } from './state.js';
import { requestScreenshotImport, validateScreenshotImport, type ValidatedScreenshotImport } from '../import/screenshotImport.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;

export interface ScreenshotImportCallbacks {
  getData: () => DataBundle | undefined;
  renderStructure: () => void;
  afterApply: () => void;
}

function setStatus(text: string, kind: 'idle' | 'working' | 'success' | 'error' = 'idle'): void {
  const status = $('#screenshot-import-status');
  status.textContent = text;
  status.dataset.kind = kind;
}

function reviewPaths(result: ValidatedScreenshotImport): string[] {
  return result.lowConfidenceFields.map(field => field.path);
}

export function bindScreenshotImport(state: ApplicationState, callbacks: ScreenshotImportCallbacks): void {
  const button = $<HTMLButtonElement>('#screenshot-import');
  const input = $<HTMLInputElement>('#screenshot-file');
  const optimize = $<HTMLButtonElement>('#optimize');

  const applyImport = (result: ValidatedScreenshotImport): void => {
    state.importScreenshot(result.board, result.menu, result.tokensRemaining);
    callbacks.renderStructure();
    callbacks.afterApply();
    const paths = reviewPaths(result);
    applyScreenshotReviewHighlights(paths);
    if (result.requiresReview) {
      const count = Math.max(paths.length, result.warnings.length);
      setStatus(`Imported board and actions · review ${count} flagged field${count === 1 ? '' : 's'} outlined in red before optimizing.`, 'error');
    } else {
      setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions.`, 'success');
    }
  };

  optimize.addEventListener('click', () => {
    clearScreenshotReviewHighlights();
    if ($('#screenshot-import-status').dataset.kind === 'error') {
      setStatus('Imported screenshot confirmed by optimization.', 'success');
    }
  }, { capture: true });

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
      applyImport(validateScreenshotImport(raw, data, state.board));
    } catch (error) {
      clearScreenshotReviewHighlights();
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    } finally {
      button.disabled = false;
      button.textContent = 'Import Screenshot';
    }
  });
}
