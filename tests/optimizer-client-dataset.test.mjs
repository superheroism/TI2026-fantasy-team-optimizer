import assert from 'node:assert/strict';
import test from 'node:test';

import { OptimizerRequestCancelledError, OptimizerWorkerClient } from '../docs/js/ui/optimizerClient.js';

const state={
  board:{},tokensRemaining:2,menu:[],menuRerollAvailable:true,username:'test',objective:'expected_score',
};

class FakeWorker {
  messages=[];terminated=false;onmessage=null;onerror=null;
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
}

test('optimizer client propagates an explicit statistical dataset id across the worker boundary',async()=>{
  const worker=new FakeWorker();
  const client=new OptimizerWorkerClient(()=>worker);
  const pending=client.optimize(state,'group-stage-correlations');
  assert.equal(worker.messages.length,1);
  assert.equal(worker.messages[0].datasetId,'group-stage-correlations');
  client.dispose();
  await assert.rejects(pending,OptimizerRequestCancelledError);
});

test('legacy callers may omit dataset id and the worker can apply its Pre-TI2026 default',async()=>{
  const worker=new FakeWorker();
  const client=new OptimizerWorkerClient(()=>worker);
  const pending=client.optimize(state);
  assert.equal('datasetId' in worker.messages[0],false);
  client.dispose();
  await assert.rejects(pending,OptimizerRequestCancelledError);
});
