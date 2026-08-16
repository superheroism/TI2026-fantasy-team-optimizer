/// <reference lib="webworker" />
import type { OptimizerState } from '../domain/types.js';
import { convertStatisticalModel } from '../data/statisticalModel.js';
import { runOptimizerWorkerRequest } from './optimizerWorkerRuntime.js';

type OptimizeRequest={type:'optimize';requestId:number;state:OptimizerState};
type WorkerResponse=
  | {type:'result';requestId:number;payload:ReturnType<typeof runOptimizerWorkerRequest>}
  | {type:'error';requestId:number;message:string};

const scope=self as DedicatedWorkerGlobalScope;
const dataPromise=(async()=>{
  // Resolve immutable model assets from the deployment root, not relative to /js/ui/.
  const modelUrl=new URL('../../data/ti2026-statistical-model.json',import.meta.url);
  const titleUrl=new URL('../../data/ti2026-title-model.json',import.meta.url);
  const [modelResponse,titleResponse]=await Promise.all([fetch(modelUrl,{cache:'no-store'}),fetch(titleUrl,{cache:'no-store'})]);
  if(!modelResponse.ok)throw new Error(`Local statistical model failed to load: ${modelResponse.status} ${modelResponse.statusText}`);
  if(!titleResponse.ok)throw new Error(`Local title model failed to load: ${titleResponse.status} ${titleResponse.statusText}`);
  return convertStatisticalModel(await modelResponse.json(),await titleResponse.json());
})();

scope.onmessage=async(event:MessageEvent<OptimizeRequest>)=>{
  const message=event.data;
  if(message?.type!=='optimize')return;
  try{
    const data=await dataPromise;
    const payload=runOptimizerWorkerRequest(message.state,data);
    scope.postMessage({type:'result',requestId:message.requestId,payload} satisfies WorkerResponse);
  }catch(error){
    scope.postMessage({type:'error',requestId:message.requestId,message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);
  }
};
