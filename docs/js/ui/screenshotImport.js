import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import { getLastLocalOcrMetrics, requestScreenshotImport, validateScreenshotImport } from '../import/screenshotImport.js';
import { diagnoseLocalScreenshotOcr, warmLocalScreenshotOcr } from '../import/localScreenshotOcr.js';
const $ = (selector) => document.querySelector(selector);
let latestDiagnosticJson;
let diagnosticToastTimer;
function setStatus(text, kind = 'idle') { const status = $('#screenshot-import-status'); status.textContent = text; status.dataset.kind = kind; }
function reviewPaths(result) { return result.lowConfidenceFields.map(field => field.path); }
export async function copyDiagnosticJson(json, writeText) {
    if (!writeText)
        return false;
    try {
        await writeText(json);
        return true;
    }
    catch {
        return false;
    }
}
function clearDiagnostic(button, toast) {
    latestDiagnosticJson = undefined;
    button.disabled = true;
    button.hidden = true;
    toast.hidden = true;
    if (diagnosticToastTimer !== undefined) {
        window.clearTimeout(diagnosticToastTimer);
        diagnosticToastTimer = undefined;
    }
}
function setDiagnostic(value, button) {
    latestDiagnosticJson = JSON.stringify(value, null, 2);
    button.hidden = false;
    button.disabled = false;
}
function showDiagnosticToast(toast, text, kind) {
    toast.textContent = text;
    toast.dataset.kind = kind;
    toast.hidden = false;
    if (diagnosticToastTimer !== undefined)
        window.clearTimeout(diagnosticToastTimer);
    diagnosticToastTimer = window.setTimeout(() => { toast.hidden = true; diagnosticToastTimer = undefined; }, 1800);
}
function clearActionReviewHighlights() { document.querySelectorAll('.op-select.screenshot-review-target-operation').forEach(select => select.classList.remove('screenshot-review-target-operation')); }
function applyActionReviewHighlights(paths) {
    clearActionReviewHighlights();
    for (const path of paths) {
        const match = path.match(/^operationIds\.(\d+)$/) ?? path.match(/^operationIds\[(\d+)\]$/);
        if (!match)
            continue;
        const index = Number(match[1]);
        if (Number.isInteger(index))
            document.querySelector(`.op-select[data-opfield="action"][aria-label="Action ${index + 1}"]`)?.classList.add('screenshot-review-target-operation');
    }
}
function clearTokenReviewHighlight() { $('#tokens')?.classList.remove('screenshot-review-target-token'); }
function applyTokenReviewHighlight(paths) { clearTokenReviewHighlight(); if (paths.some(path => path === 'tokensRemaining'))
    $('#tokens')?.classList.add('screenshot-review-target-token'); }
function clearAllReviewHighlights() { clearScreenshotReviewHighlights(); clearActionReviewHighlights(); clearTokenReviewHighlight(); }
export function bindScreenshotImport(state, callbacks) {
    const button = $('#screenshot-import'), input = $('#screenshot-file'), optimize = $('#optimize'), diagnosticButton = $('#screenshot-ocr-diagnostic-copy'), diagnosticToast = $('#screenshot-ocr-diagnostic-toast');
    clearDiagnostic(diagnosticButton, diagnosticToast);
    const prewarm = () => { void warmLocalScreenshotOcr().catch(() => undefined); };
    button.addEventListener('pointerenter', prewarm, { once: true });
    button.addEventListener('focus', prewarm, { once: true });
    diagnosticButton.addEventListener('click', async () => {
        if (!latestDiagnosticJson)
            return;
        const writeText = navigator.clipboard?.writeText?.bind(navigator.clipboard);
        const copied = await copyDiagnosticJson(latestDiagnosticJson, writeText);
        showDiagnosticToast(diagnosticToast, copied ? 'Copied!' : 'Copy failed', copied ? 'success' : 'error');
    });
    const applyImport = (result, elapsedMs) => {
        state.importScreenshot(result.board, result.menu, result.tokensRemaining);
        callbacks.renderStructure();
        callbacks.afterApply();
        const paths = reviewPaths(result);
        applyScreenshotReviewHighlights(paths);
        applyActionReviewHighlights(paths);
        applyTokenReviewHighlight(paths);
        const elapsed = elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
        if (result.requiresReview) {
            const count = paths.length;
            setStatus(`Imported in ${elapsed} · review ${count} flagged field${count === 1 ? '' : 's'} outlined in red before optimizing.`, 'error');
        }
        else
            setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions in ${elapsed}.`, 'success');
    };
    optimize.addEventListener('click', () => { clearAllReviewHighlights(); if ($('#screenshot-import-status').dataset.kind === 'error')
        setStatus('Imported screenshot confirmed by optimization.', 'success'); }, { capture: true });
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
        clearDiagnostic(diagnosticButton, diagnosticToast);
        setStatus('Local OCR: locating board and reading visible fields…', 'working');
        const started = performance.now();
        try {
            const raw = await requestScreenshotImport(file, data), validated = validateScreenshotImport(raw, data, state.board, state.menu), productionDiagnostic = getLastLocalOcrMetrics();
            if (productionDiagnostic)
                setDiagnostic(productionDiagnostic, diagnosticButton);
            applyImport(validated, performance.now() - started);
        }
        catch (error) {
            clearAllReviewHighlights();
            setStatus(error instanceof Error ? error.message : String(error), 'error');
            const productionDiagnostic = getLastLocalOcrMetrics();
            if (productionDiagnostic)
                setDiagnostic({ importError: String(error), ...productionDiagnostic }, diagnosticButton);
            else {
                try {
                    setDiagnostic({ importError: String(error), browserOcr: await diagnoseLocalScreenshotOcr(file) }, diagnosticButton);
                }
                catch (diagError) {
                    setDiagnostic({ importError: String(error), diagnosticError: String(diagError) }, diagnosticButton);
                }
            }
        }
        finally {
            button.disabled = false;
            button.textContent = 'Import Screenshot';
        }
    });
}
//# sourceMappingURL=screenshotImport.js.map