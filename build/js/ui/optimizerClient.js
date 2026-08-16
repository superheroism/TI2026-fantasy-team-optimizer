export class OptimizerRequestCancelledError extends Error {
    constructor(message = 'Optimizer request superseded by newer state.') { super(message); this.name = 'OptimizerRequestCancelledError'; }
}
export class OptimizerWorkerClient {
    workerFactory;
    worker;
    requestSequence = 0;
    pending;
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
        return worker;
    }
    failCurrent(error) {
        const pending = this.pending;
        this.pending = undefined;
        if (pending)
            pending.reject(error);
    }
    terminateCurrent(reason) {
        const pending = this.pending;
        this.pending = undefined;
        if (this.worker) {
            this.worker.terminate();
            this.worker = undefined;
        }
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
        pending.resolve({ ...message.payload, requestId: message.requestId, transferRoundTripMs: performance.now() - pending.started });
    }
    optimize(state) {
        if (this.pending)
            this.terminateCurrent('Optimizer request superseded by a newer optimization request.');
        const requestId = ++this.requestSequence, started = performance.now(), worker = this.ensureWorker();
        return new Promise((resolve, reject) => {
            this.pending = { requestId, started, resolve, reject };
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
        else if (this.worker) {
            this.worker.terminate();
            this.worker = undefined;
        }
    }
}
//# sourceMappingURL=optimizerClient.js.map