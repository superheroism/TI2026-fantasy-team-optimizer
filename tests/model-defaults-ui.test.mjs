import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const index=read('../site/index.html');
const state=read('../src/ui/state.ts');
const loader=read('../src/data/statisticalModel.ts');
const worker=read('../src/ui/optimizer.worker.ts');
const app=read('../src/ui/app.ts');

test('fresh sessions show 30 tokens and default to Main Event',()=>{
  assert.match(index,/id="tokens"[^>]*value="30"/);
  assert.match(index,/value="group-stage-correlations" selected>Main Event<\/option>/);
  assert.match(state,/tokensRemaining = 30/);
  assert.match(state,/statisticalDatasetId:StatisticalDatasetId='group-stage-correlations'/);
  assert.match(loader,/DEFAULT_STATISTICAL_DATASET_ID:StatisticalDatasetId='group-stage-correlations'/);
});

test('browser and worker apply Main Event eligibility only to the Main Event model',()=>{
  assert.match(loader,/convertStatisticalModel\(raw,titles,datasetId,datasetId==='group-stage-correlations'\)/);
  assert.match(worker,/convertStatisticalModel\(await modelResponse\.json\(\),await titlePromise,datasetId,datasetId==='group-stage-correlations'\)/);
});

test('a saved model preference still overrides the fresh-session default',()=>{
  assert.match(app,/localStorage\.getItem\('dota2-fantasy-data-source'\)/);
  assert.match(app,/if\(savedDataset&&STATISTICAL_DATASETS\[savedDataset\]\)appState\.statisticalDatasetId=savedDataset/);
});
