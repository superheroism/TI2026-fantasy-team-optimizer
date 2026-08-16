import type { OptimizerState } from '../domain/types.js';
import type { OptimizerWorkerResult } from './optimizerWorkerRuntime.js';

interface OptimizeResponse {type:'result';requestId:number;payload:OptimizerWorkerResult}
interface ErrorResponse {type:'error';requestId:number;message:string}
type WorkerResponse=OptimizeResponse|ErrorResponse;

export class OptimizerRequestCancelledError extends Error {
  constructor(message='Optimizer request superseded by newer state.') { super(message);this.name='OptimizerRequestCancelledError'; }
}

export interface WorkerLike {
  postMessage(message:unknown):void;
  terminate():void;
  onmessage:((event:MessageEvent<WorkerResponse>)=>void)|null;
  onerror:((event:ErrorEvent)=>void)|null;
}
export type OptimizerWorkerFactory=()=>WorkerLike;

export interface OptimizerClientResult extends OptimizerWorkerResult {
  requestId:number;
  transferRoundTripMs:number;
}

interface PendingRequest {
  requestId:number;
  started:number;
  resolve:(result:OptimizerClientResult)=>void;
  reject:(error:Error)=>void;
}

export class OptimizerWorkerClient {
  private worker:WorkerLike|undefined;
  private requestSequence=0;
  private pending:PendingRequest|undefined;

  constructor(private readonly workerFactory:OptimizerWorkerFactory=()=>new Worker(new URL('./optimizer.worker.js',import.meta.url),{type:'module'})) {}

  private ensureWorker():WorkerLike {
    if(this.worker)return this.worker;
    const worker=this.workerFactory();
    worker.onmessage=(event)=>this.handleMessage(event.data);
    worker.onerror=(event)=>this.failCurrent(new Error(event.message||'Optimizer worker failed.'));
    this.worker=worker;
    return worker;
  }

  private failCurrent(error:Error):void {
    const pending=this.pending;this.pending=undefined;
    if(pending)pending.reject(error);
  }

  private terminateCurrent(reason:string):void {
    const pending=this.pending;this.pending=undefined;
    if(this.worker){this.worker.terminate();this.worker=undefined;}
    if(pending)pending.reject(new OptimizerRequestCancelledError(reason));
  }

  private handleMessage(message:WorkerResponse):void {
    const pending=this.pending;
    if(!pending||message.requestId!==pending.requestId)return; // deterministic stale-response suppression
    this.pending=undefined;
    if(message.type==='error'){pending.reject(new Error(message.message));return;}
    pending.resolve({...message.payload,requestId:message.requestId,transferRoundTripMs:performance.now()-pending.started});
  }

  optimize(state:OptimizerState):Promise<OptimizerClientResult> {
    if(this.pending)this.terminateCurrent('Optimizer request superseded by a newer optimization request.');
    const requestId=++this.requestSequence,started=performance.now(),worker=this.ensureWorker();
    return new Promise((resolve,reject)=>{
      this.pending={requestId,started,resolve,reject};
      worker.postMessage({type:'optimize',requestId,state});
    });
  }

  /** Invalidate prior UI state. Pending work is truly cancelled; an idle worker is retained for warm reuse. */
  invalidate():void {
    ++this.requestSequence;
    if(this.pending)this.terminateCurrent('Optimizer request invalidated by a board or control change.');
  }

  dispose():void {
    ++this.requestSequence;
    if(this.pending)this.terminateCurrent('Optimizer client disposed.');
    else if(this.worker){this.worker.terminate();this.worker=undefined;}
  }
}
