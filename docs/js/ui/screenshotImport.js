import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import { getLastLocalOcrMetrics, requestScreenshotImport, validateScreenshotImport } from '../import/screenshotImport.js';
import { diagnoseLocalScreenshotOcr, warmLocalScreenshotOcr } from '../import/localScreenshotOcr.js';
const $ = (selector) => document.querySelector(selector);
export function canonicalScreenshotReviewPath(path) {
    return path.replace(/\[(\d+)\]/g, '.$1');
}
/** DOM-independent source of truth for unresolved fields from the latest screenshot import. */
export class ScreenshotReviewPathState {
    unresolved = new Set();
    sessionActive = false;
    replace(paths) {
        this.unresolved.clear();
        for (const path of paths)
            this.unresolved.add(canonicalScreenshotReviewPath(path));
        this.sessionActive = true;
    }
    resolve(path) {
        return this.unresolved.delete(canonicalScreenshotReviewPath(path));
    }
    clear() {
        this.unresolved.clear();
        this.sessionActive = false;
    }
    get paths() { return [...this.unresolved]; }
    get count() { return this.unresolved.size; }
    get active() { return this.sessionActive; }
}
let latestDiagnosticJson;
let diagnosticToastTimer;
const activeScreenshotReviewState = new ScreenshotReviewPathState();
function emitScreenshotImportStage(event) {
    const hook = window.__TI2026_TEST_HOOKS__?.onScreenshotImportStage;
    if (!hook)
        return;
    try {
        hook(structuredClone(event));
    }
    catch { }
}
function setStatus(text, kind = 'idle') { const status = $('#screenshot-import-status'); status.textContent = text; status.dataset.kind = kind; }
function reviewPaths(result) { return result.lowConfidenceFields.map(field => canonicalScreenshotReviewPath(field.path)); }
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
export function renderActiveScreenshotReviewHighlights() {
    const paths = activeScreenshotReviewState.paths;
    applyScreenshotReviewHighlights(paths);
    applyActionReviewHighlights(paths);
    applyTokenReviewHighlight(paths);
}
function updateReviewProgressStatus() {
    if (!activeScreenshotReviewState.active)
        return;
    const count = activeScreenshotReviewState.count;
    if (count === 0) {
        setStatus('All flagged screenshot fields reviewed. Run Optimizer to confirm.', 'success');
        return;
    }
    setStatus(count === 1 ? '1 field still requires review.' : `${count} fields still require review.`, 'error');
}
export function resolveScreenshotReviewPath(path) {
    const changed = activeScreenshotReviewState.resolve(path);
    if (!changed)
        return false;
    renderActiveScreenshotReviewHighlights();
    updateReviewProgressStatus();
    return true;
}
export function discardScreenshotReviewState(message = 'Screenshot review cleared because the board changed.') {
    const wasActive = activeScreenshotReviewState.active;
    activeScreenshotReviewState.clear();
    clearAllReviewHighlights();
    if (wasActive)
        setStatus(message, 'idle');
}
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
        const paths = reviewPaths(result);
        activeScreenshotReviewState.replace(paths);
        state.importScreenshot(result.board, result.menu, result.tokensRemaining);
        callbacks.renderStructure();
        callbacks.afterApply();
        emitScreenshotImportStage({ stage: 'applied', value: { board: state.board, menu: state.menu, tokensRemaining: state.tokensRemaining } });
        renderActiveScreenshotReviewHighlights();
        const elapsed = elapsedMs < 1000 ? `${Math.round(elapsedMs)} ms` : `${(elapsedMs / 1000).toFixed(1)} s`;
        if (result.requiresReview) {
            const count = paths.length;
            setStatus(`Imported in ${elapsed} · review ${count} flagged field${count === 1 ? '' : 's'} outlined in red before optimizing.`, 'error');
        }
        else
            setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions in ${elapsed}.`, 'success');
    };
    optimize.addEventListener('click', () => {
        if (!activeScreenshotReviewState.active)
            return;
        activeScreenshotReviewState.clear();
        clearAllReviewHighlights();
        setStatus('Imported screenshot confirmed by optimization.', 'success');
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
        activeScreenshotReviewState.clear();
        clearAllReviewHighlights();
        button.disabled = true;
        button.textContent = 'Reading Screenshot…';
        clearDiagnostic(diagnosticButton, diagnosticToast);
        setStatus('Local OCR: locating board and reading visible fields…', 'working');
        const started = performance.now();
        try {
            const raw = await requestScreenshotImport(file, data), productionDiagnostic = getLastLocalOcrMetrics();
            emitScreenshotImportStage({ stage: 'raw', value: raw, localOcrMetrics: productionDiagnostic });
            const validated = validateScreenshotImport(raw, data, state.board, state.menu);
            emitScreenshotImportStage({ stage: 'validated', value: validated });
            if (productionDiagnostic)
                setDiagnostic(productionDiagnostic, diagnosticButton);
            applyImport(validated, performance.now() - started);
        }
        catch (error) {
            activeScreenshotReviewState.clear();
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