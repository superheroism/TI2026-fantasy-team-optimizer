export interface OcrRect {
  left:number;
  top:number;
  width:number;
  height:number;
}

export type OcrRecognitionData={
  text?:string;
  tsv?:string;
};

export interface OcrWorker {
  recognize(
    image:HTMLCanvasElement|File,
    options?:Record<string,unknown>,
    output?:Record<string,boolean>,
  ):Promise<unknown>;
  setParameters(params:Record<string,unknown>):Promise<unknown>;
  terminate?():Promise<unknown>|unknown;
}

export interface OcrCallDiagnostic {
  stage:string;
  psm:string;
  crop?:OcrRect;
  canvasWidth:number;
  canvasHeight:number;
  pixelCount:number;
  elapsedMs:number;
  wordCount:number;
  outcome:'success'|'timeout'|'error'|'invalid-geometry';
  timeoutReason?:'call-timeout'|'overall-budget';
  geometryReason?:string;
}

export interface OcrExecutionBudget {
  startedAtMs:number;
  totalBudgetMs:number;
  perCallTimeoutMs:number;
  exhausted:boolean;
  calls:OcrCallDiagnostic[];
}

export interface OcrRecognitionMeta {
  stage:string;
  psm:string|number;
  crop?:OcrRect;
  canvasWidth:number;
  canvasHeight:number;
  sourceWidth?:number;
  sourceHeight?:number;
}

export const DEFAULT_OCR_CALL_TIMEOUT_MS=10_000;
export const DEFAULT_OCR_TOTAL_BUDGET_MS=20_000;

export function createOcrExecutionBudget(
  totalBudgetMs=DEFAULT_OCR_TOTAL_BUDGET_MS,
  perCallTimeoutMs=DEFAULT_OCR_CALL_TIMEOUT_MS,
):OcrExecutionBudget{
  return{startedAtMs:performance.now(),totalBudgetMs,perCallTimeoutMs,exhausted:false,calls:[]};
}

export function remainingOcrBudgetMs(budget:OcrExecutionBudget):number{
  return Math.max(0,budget.totalBudgetMs-(performance.now()-budget.startedAtMs));
}

export function validateOcrRect(rect:OcrRect,sourceWidth?:number,sourceHeight?:number):string|undefined{
  const values=[rect.left,rect.top,rect.width,rect.height];
  if(values.some(value=>!Number.isFinite(value)))return'non-finite';
  if(rect.width<=0||rect.height<=0)return'non-positive-area';
  if(rect.left<0||rect.top<0)return'negative-origin';
  if(sourceWidth!==undefined||sourceHeight!==undefined){
    if(!Number.isFinite(sourceWidth)||!Number.isFinite(sourceHeight)||(sourceWidth??0)<=0||(sourceHeight??0)<=0)return'invalid-source-bounds';
    if(rect.left+rect.width>(sourceWidth as number)+1||rect.top+rect.height>(sourceHeight as number)+1)return'out-of-bounds';
  }
  return undefined;
}

function recognitionGeometryReason(meta:OcrRecognitionMeta):string|undefined{
  if(!Number.isFinite(meta.canvasWidth)||!Number.isFinite(meta.canvasHeight)||meta.canvasWidth<=0||meta.canvasHeight<=0)return'invalid-canvas';
  return meta.crop?validateOcrRect(meta.crop,meta.sourceWidth,meta.sourceHeight):undefined;
}

function wordCount(tsv?:string):number{
  if(!tsv)return 0;
  let count=0;
  for(const row of tsv.split(/\r?\n/).slice(1)){
    const columns=row.split('\t');
    if(columns.length>=12&&columns[0]==='5'&&columns.slice(11).join('\t').trim())count++;
  }
  return count;
}

class OcrTimeoutError extends Error{
  constructor(readonly reason:'call-timeout'|'overall-budget'){
    super(reason);
    this.name='OcrTimeoutError';
  }
}

function diagnosticBase(meta:OcrRecognitionMeta){
  const pixelCount=Number.isFinite(meta.canvasWidth)&&Number.isFinite(meta.canvasHeight)&&meta.canvasWidth>0&&meta.canvasHeight>0?meta.canvasWidth*meta.canvasHeight:0;
  return{
    stage:meta.stage,
    psm:String(meta.psm),
    ...(meta.crop?{crop:meta.crop}:{}),
    canvasWidth:meta.canvasWidth,
    canvasHeight:meta.canvasHeight,
    pixelCount,
  };
}

export async function recognizeWithBudget(
  worker:OcrWorker,
  image:HTMLCanvasElement|File,
  budget:OcrExecutionBudget,
  meta:OcrRecognitionMeta,
  options:Record<string,unknown>={},
  output:Record<string,boolean>={tsv:true},
  onTimeout?:()=>Promise<unknown>|unknown,
):Promise<{data:OcrRecognitionData}>{
  const geometryReason=recognitionGeometryReason(meta);
  if(geometryReason){
    budget.calls.push({...diagnosticBase(meta),elapsedMs:0,wordCount:0,outcome:'invalid-geometry',geometryReason});
    return{data:{text:'',tsv:''}};
  }

  const remaining=remainingOcrBudgetMs(budget);
  if(budget.exhausted||remaining<=0){
    budget.exhausted=true;
    budget.calls.push({...diagnosticBase(meta),elapsedMs:0,wordCount:0,outcome:'timeout',timeoutReason:'overall-budget'});
    return{data:{text:'',tsv:''}};
  }

  const timeoutMs=Math.min(budget.perCallTimeoutMs,remaining);
  const timeoutReason:OcrTimeoutError['reason']=remaining<=budget.perCallTimeoutMs?'overall-budget':'call-timeout';
  const started=performance.now();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    const rawResult=await Promise.race([
      worker.recognize(image,options,output),
      new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new OcrTimeoutError(timeoutReason)),timeoutMs);}),
    ]);
    const result=rawResult as {data:OcrRecognitionData};
    if(timer!==undefined)clearTimeout(timer);
    budget.calls.push({...diagnosticBase(meta),elapsedMs:performance.now()-started,wordCount:wordCount(result.data.tsv),outcome:'success'});
    return result;
  }catch(error){
    if(timer!==undefined)clearTimeout(timer);
    if(error instanceof OcrTimeoutError){
      budget.exhausted=true;
      budget.calls.push({...diagnosticBase(meta),elapsedMs:performance.now()-started,wordCount:0,outcome:'timeout',timeoutReason:error.reason});
      try{void Promise.resolve(onTimeout?.()).catch(()=>undefined);}catch{ /* best-effort worker reset */ }
      return{data:{text:'',tsv:''}};
    }
    budget.calls.push({...diagnosticBase(meta),elapsedMs:performance.now()-started,wordCount:0,outcome:'error'});
    throw error;
  }
}
