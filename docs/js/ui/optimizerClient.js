export class OptimizerRequestCancelledError extends Error {
    constructor(message = 'Optimizer request superseded by newer state.') { super(message); this.name = 'OptimizerRequestCancelledError'; }
}
// Scoring/target caches intentionally live for the worker/DataBundle lifetime. Bound that
// lifetime so a long editing session cannot retain every hypothetical board indefinitely.
// Target-probability t>=2 is retired immediately after completion because browser soak
// evidence shows that route creates the largest persistent cache growth.
const MAX_COMPLETED_REQUESTS_PER_WORKER = 8;
export class OptimizerWorkerClient {
    workerFactory;
    worker;
    requestSequence = 0;
    pending;
    completedRequestsOnWorker = 0;
    constructor(workerFactory = () => new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' })) {
        this.workerFactory = workerFactory;
    }
    ensureWorker() {
        if (this.worker)
            return this.worker;
        const worker = this.workerFactory();
        worker.onmessage = (event) => this.handleMessage(event.data);
        worker.onerror = (event) => this.failCurrent(new Error(event.message || 'Optimizer worker failed.'));
        this.worker = worker;
        this.completedRequestsOnWorker = 0;
        return worker;
    }
    failCurrent(error) {
        const pending = this.pending;
        this.pending = undefined;
        if (pending)
            pending.reject(error);
    }
    retireIdleWorker() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = undefined;
        }
        this.completedRequestsOnWorker = 0;
    }
    terminateCurrent(reason) {
        const pending = this.pending;
        this.pending = undefined;
        this.retireIdleWorker();
        if (pending)
            pending.reject(new OptimizerRequestCancelledError(reason));
    }
    handleMessage(message) {
        const pending = this.pending;
        if (!pending || message.requestId !== pending.requestId)
            return; // deterministic stale-response suppression
        this.pending = undefined;
        if (message.type === 'error') {
            pending.reject(new Error(message.message));
            return;
        }
        const result = { ...message.payload, requestId: message.requestId, transferRoundTripMs: performance.now() - pending.started };
        this.completedRequestsOnWorker++;
        if (pending.retireWorkerAfterResult || this.completedRequestsOnWorker >= MAX_COMPLETED_REQUESTS_PER_WORKER)
            this.retireIdleWorker();
        pending.resolve(result);
    }
    optimize(state) {
        if (this.pending)
            this.terminateCurrent('Optimizer request superseded by a newer optimization request.');
        const requestId = ++this.requestSequence, started = performance.now(), worker = this.ensureWorker();
        // Normal production search is capped at two modeled spends. A target request with at
        // least two available tokens therefore enters the high-retention target route.
        const retireWorkerAfterResult = state.objective === 'target_probability' && state.tokensRemaining >= 2;
        return new Promise((resolve, reject) => {
            this.pending = { requestId, started, retireWorkerAfterResult, resolve, reject };
            worker.postMessage({ type: 'optimize', requestId, state });
        });
    }
    /** Invalidate prior UI state. Pending work is truly cancelled; an idle worker is retained for warm reuse. */
    invalidate() {
        ++this.requestSequence;
        if (this.pending)
            this.terminateCurrent('Optimizer request invalidated by a board or control change.');
    }
    dispose() {
        ++this.requestSequence;
        if (this.pending)
            this.terminateCurrent('Optimizer client disposed.');
        else
            this.retireIdleWorker();
    }
}
//# sourceMappingURL=optimizerClient.js.map