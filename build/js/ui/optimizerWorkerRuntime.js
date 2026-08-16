import { getLastOptimizerEngineDiagnostics, recommendNextAction } from '../engine/optimizer.js';
/** Pure worker-side boundary retained separately so Node parity tests can exercise the exact worker path. */
export function runOptimizerWorkerRequest(state, data) {
    const started = performance.now();
    const result = recommendNextAction(state, data, true);
    return { result, diagnostics: getLastOptimizerEngineDiagnostics(), optimizerWallMs: performance.now() - started };
}
//# sourceMappingURL=optimizerWorkerRuntime.js.map