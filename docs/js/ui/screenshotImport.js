import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import { getLastLocalOcrMetrics, requestScreenshotImport, validateScreenshotImport } from '../import/screenshotImport.js';
import { diagnoseLocalScreenshotOcr, warmLocalScreenshotOcr } from '../import/localScreenshotOcr.js';
const $ = (selector) => document.querySelector(selector);
function setStatus(text, kind = 'idle') { const status = $('#screenshot-import-status'); status.textContent = text; status.dataset.kind = kind; }
function reviewPaths(result) { return result.lowConfidenceFields.map(field => field.path); }
function removeDiagnostic() { document.querySelector('#screenshot-ocr-diagnostic')?.remove(); }
function showDiagnostic(value) { removeDiagnostic(); const host = $('#screenshot-import-status').parentElement; if (!host)
    return; const details = document.createElement('details'); details.id = 'screenshot-ocr-diagnostic'; details.open = true; const summary = document.createElement('summary'); summary.textContent = 'OCR diagnostic'; const pre = document.createElement('pre'); pre.style.whiteSpace = 'pre-wrap'; pre.style.wordBreak = 'break-word'; pre.textContent = JSON.stringify(value, null, 2); const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy diagnostic'; copy.addEventListener('click', () => void navigator.clipboard?.writeText(pre.textContent ?? '')); details.append(summary, copy, pre); host.appendChild(details); }
function clearActionReviewHighlights() { document.querySelectorAll('.op-card.screenshot-review-target-operation').forEach(card => card.classList.remove('screenshot-review-target-operation')); }
function applyActionReviewHighlights(paths) { clearActionReviewHighlights(); for (const path of paths) {
    const match = path.match(/^operationIds\.(\d+)$/) ?? path.match(/^operationIds\[(\d+)\]$/);
    if (!match)
        continue;
    const index = Number(match[1]);
    if (Number.isInteger(index))
        document.querySelector(`.op-card[data-op="${index}"]`)?.classList.add('screenshot-review-target-operation');
} }
function clearAllReviewHighlights() { clearScreenshotReviewHighlights(); clearActionReviewHighlights(); }
export function bindScreenshotImport(state, callbacks) {
    const button = $('#screenshot-import'), input = $('#screenshot-file'), optimize = $('#optimize');
    const prewarm = () => { void warmLocalScreenshotOcr().catch(() => undefined); };
    button.addEventListener('pointerenter', prewarm, { once: true });
    button.addEventListener('focus', prewarm, { once: true });
    const applyImport = (result, elapsedMs) => { state.importScreenshot(result.board, result.menu, result.tokensRemaining); callbacks.renderStructure(); callbacks.afterApply(); const paths = reviewPaths(result); applyScreenshotReviewHighlights(paths); applyActionReviewHighlights(paths); const elapsed = elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`; if (result.requiresReview) {
        const count = Math.max(paths.length, result.warnings.length);
        setStatus(`Imported in ${elapsed} · review ${count} flagged field${count === 1 ? '' : 's'} outlined in red before optimizing.`, 'error');
    }
    else
        setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions in ${elapsed}.`, 'success'); };
    optimize.addEventListener('click', () => { clearAllReviewHighlights(); if ($('#screenshot-import-status').dataset.kind === 'error')
        setStatus('Imported screenshot confirmed by optimization.', 'success'); }, { capture: true });
    button.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { const file = input.files?.[0]; input.value = ''; if (!file)
        return; const data = callbacks.getData(); if (!data) {
        setStatus('Tournament model is still loading.', 'error');
        return;
    } button.disabled = true; button.textContent = 'Reading Screenshot…'; removeDiagnostic(); setStatus('Local OCR: locating board and reading visible fields…', 'working'); const started = performance.now(); try {
        const raw = await requestScreenshotImport(file, data);
        const validated = validateScreenshotImport(raw, data, state.board, state.menu);
        applyImport(validated, performance.now() - started);
        if (validated.requiresReview) {
            const productionDiagnostic = getLastLocalOcrMetrics();
            if (productionDiagnostic)
                showDiagnostic(productionDiagnostic);
            else {
                try {
                    showDiagnostic(await diagnoseLocalScreenshotOcr(file));
                }
                catch (diagError) {
                    showDiagnostic({ diagnosticError: String(diagError) });
                }
            }
        }
    }
    catch (error) {
        clearAllReviewHighlights();
        setStatus(error instanceof Error ? error.message : String(error), 'error');
        const productionDiagnostic = getLastLocalOcrMetrics();
        if (productionDiagnostic)
            showDiagnostic({ importError: String(error), ...productionDiagnostic });
        else {
            try {
                showDiagnostic({ importError: String(error), browserOcr: await diagnoseLocalScreenshotOcr(file) });
            }
            catch (diagError) {
                showDiagnostic({ importError: String(error), diagnosticError: String(diagError) });
            }
        }
    }
    finally {
        button.disabled = false;
        button.textContent = 'Import Screenshot';
    } });
}
//# sourceMappingURL=screenshotImport.js.map