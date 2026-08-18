import { DEFAULT_STATISTICAL_DATASET_ID, convertStatisticalModel, statisticalDatasetDefinition } from '../data/statisticalModel.js';
import { runOptimizerWorkerRequest } from './optimizerWorkerRuntime.js';
const scope = self;
const titleUrl = new URL('../../data/ti2026-title-model.json', import.meta.url);
const titlePromise = (async () => {
    const response = await fetch(titleUrl, { cache: 'no-store' });
    if (!response.ok)
        throw new Error(`Local title model failed to load: ${response.status} ${response.statusText}`);
    return response.json();
})();
const dataPromises = new Map();
function dataFor(datasetId) {
    const prior = dataPromises.get(datasetId);
    if (prior)
        return prior;
    const promise = (async () => {
        const dataset = statisticalDatasetDefinition(datasetId);
        const modelUrl = new URL(`../../${dataset.modelUrl.replace(/^\.\//, '')}`, import.meta.url);
        const modelResponse = await fetch(modelUrl, { cache: 'no-store' });
        if (!modelResponse.ok)
            throw new Error(`Local statistical model failed to load: ${modelResponse.status} ${modelResponse.statusText}`);
        return convertStatisticalModel(await modelResponse.json(), await titlePromise, datasetId, datasetId === 'group-stage-correlations');
    })();
    dataPromises.set(datasetId, promise);
    void promise.catch(() => { if (dataPromises.get(datasetId) === promise)
        dataPromises.delete(datasetId); });
    return promise;
}
scope.onmessage = async (event) => {
    const message = event.data;
    if (message?.type !== 'optimize')
        return;
    try {
        const datasetId = message.datasetId ?? DEFAULT_STATISTICAL_DATASET_ID;
        const data = await dataFor(datasetId);
        const payload = runOptimizerWorkerRequest(message.state, data);
        scope.postMessage({ type: 'result', requestId: message.requestId, payload });
    }
    catch (error) {
        scope.postMessage({ type: 'error', requestId: message.requestId, message: error instanceof Error ? error.message : String(error) });
    }
};
//# sourceMappingURL=optimizer.worker.js.map