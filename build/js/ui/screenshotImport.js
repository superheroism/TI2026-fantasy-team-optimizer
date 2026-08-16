import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import { requestScreenshotImport, validateScreenshotImport } from '../import/screenshotImport.js';
const $ = (selector) => document.querySelector(selector);
function setStatus(text, kind = 'idle') {
    const status = $('#screenshot-import-status');
    status.textContent = text;
    status.dataset.kind = kind;
}
function reviewPaths(result) {
    return result.lowConfidenceFields.map(field => field.path);
}
export function bindScreenshotImport(state, callbacks) {
    const button = $('#screenshot-import');
    const input = $('#screenshot-file');
    const optimize = $('#optimize');
    const applyImport = (result) => {
        state.importScreenshot(result.board, result.menu, result.tokensRemaining);
        callbacks.renderStructure();
        callbacks.afterApply();
        const paths = reviewPaths(result);
        applyScreenshotReviewHighlights(paths);
        if (result.requiresReview) {
            const count = Math.max(paths.length, result.warnings.length);
            setStatus(`Imported board and actions · review ${count} flagged field${count === 1 ? '' : 's'} outlined in red before optimizing.`, 'error');
        }
        else {
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
        if (!file)
            return;
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
        }
        catch (error) {
            clearScreenshotReviewHighlights();
            setStatus(error instanceof Error ? error.message : String(error), 'error');
        }
        finally {
            button.disabled = false;
            button.textContent = 'Import Screenshot';
        }
    });
}
//# sourceMappingURL=screenshotImport.js.map