import type { DataBundle } from '../domain/types.js';
import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import type { ApplicationState } from './state.js';
import { getLastLocalOcrMetrics, requestScreenshotImport, validateScreenshotImport, type ValidatedScreenshotImport } from '../import/screenshotImport.js';
import { diagnoseLocalScreenshotOcr, warmLocalScreenshotOcr } from '../import/localScreenshotOcr.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
export interface ScreenshotImportCallbacks { getData:()=>DataBundle|undefined;renderStructure:()=>void;afterApply:()=>void; }

export interface ScreenshotImportTraceEvent {
  stage:'raw'|'validated'|'applied';
  value:unknown;
  localOcrMetrics?:unknown;
}

declare global {
  interface Window {
    __TI2026_TEST_HOOKS__?: {
      onScreenshotImportStage?:(event:ScreenshotImportTraceEvent)=>void;
    };
  }
}

export function canonicalScreenshotReviewPath(path:string):string {
  return path.replace(/\[(\d+)\]/g,'.$1');
}

/** DOM-independent source of truth for unresolved fields from the latest screenshot import. */
export class ScreenshotReviewPathState {
  private readonly unresolved=new Set<string>();
  private sessionActive=false;

  replace(paths:readonly string[]):void {
    this.unresolved.clear();
    for(const path of paths)this.unresolved.add(canonicalScreenshotReviewPath(path));
    this.sessionActive=true;
  }

  resolve(path:string):boolean {
    return this.unresolved.delete(canonicalScreenshotReviewPath(path));
  }

  clear():void {
    this.unresolved.clear();
    this.sessionActive=false;
  }

  get paths():string[] { return [...this.unresolved]; }
  get count():number { return this.unresolved.size; }
  get active():boolean { return this.sessionActive; }
}

let latestDiagnosticJson:string|undefined;
let diagnosticToastTimer:number|undefined;
const activeScreenshotReviewState=new ScreenshotReviewPathState();

function emitScreenshotImportStage(event:ScreenshotImportTraceEvent):void {
  const hook=window.__TI2026_TEST_HOOKS__?.onScreenshotImportStage;
  if(!hook)return;
  try{hook(structuredClone(event));}catch{}
}
function setStatus(text:string,kind:'idle'|'working'|'success'|'error'='idle'):void { const status=$('#screenshot-import-status');status.textContent=text;status.dataset.kind=kind; }
function reviewPaths(result:ValidatedScreenshotImport):string[] { return result.lowConfidenceFields.map(field=>canonicalScreenshotReviewPath(field.path)); }

export async function copyDiagnosticJson(json:string,writeText:((value:string)=>Promise<void>)|undefined):Promise<boolean> {
  if(!writeText) return false;
  try{await writeText(json);return true;}catch{return false;}
}
function clearDiagnostic(button:HTMLButtonElement,toast:HTMLElement):void {
  latestDiagnosticJson=undefined;
  button.disabled=true;
  button.hidden=true;
  toast.hidden=true;
  if(diagnosticToastTimer!==undefined){window.clearTimeout(diagnosticToastTimer);diagnosticToastTimer=undefined;}
}
function setDiagnostic(value:unknown,button:HTMLButtonElement):void {
  latestDiagnosticJson=JSON.stringify(value,null,2);
  button.hidden=false;
  button.disabled=false;
}
function showDiagnosticToast(toast:HTMLElement,text:string,kind:'success'|'error'):void {
  toast.textContent=text;
  toast.dataset.kind=kind;
  toast.hidden=false;
  if(diagnosticToastTimer!==undefined) window.clearTimeout(diagnosticToastTimer);
  diagnosticToastTimer=window.setTimeout(()=>{toast.hidden=true;diagnosticToastTimer=undefined;},1800);
}
function clearActionReviewHighlights():void { document.querySelectorAll<HTMLElement>('.op-select.screenshot-review-target-operation').forEach(select=>select.classList.remove('screenshot-review-target-operation')); }
function applyActionReviewHighlights(paths:readonly string[]):void {
  clearActionReviewHighlights();
  for(const path of paths){
    const match=path.match(/^operationIds\.(\d+)$/)??path.match(/^operationIds\[(\d+)\]$/); if(!match) continue;
    const index=Number(match[1]); if(Number.isInteger(index)) document.querySelector<HTMLElement>(`.op-select[data-opfield="action"][aria-label="Action ${index+1}"]`)?.classList.add('screenshot-review-target-operation');
  }
}
function clearTokenReviewHighlight():void { $('#tokens')?.classList.remove('screenshot-review-target-token'); }
function applyTokenReviewHighlight(paths:readonly string[]):void { clearTokenReviewHighlight();if(paths.some(path=>path==='tokensRemaining')) $('#tokens')?.classList.add('screenshot-review-target-token'); }
function clearAllReviewHighlights():void { clearScreenshotReviewHighlights();clearActionReviewHighlights();clearTokenReviewHighlight(); }

export function renderActiveScreenshotReviewHighlights():void {
  const paths=activeScreenshotReviewState.paths;
  applyScreenshotReviewHighlights(paths);
  applyActionReviewHighlights(paths);
  applyTokenReviewHighlight(paths);
}

function updateReviewProgressStatus():void {
  if(!activeScreenshotReviewState.active)return;
  const count=activeScreenshotReviewState.count;
  if(count===0){setStatus('All flagged screenshot fields reviewed. Run Optimizer to confirm.','success');return;}
  setStatus(count===1?'1 field still requires review.':`${count} fields still require review.`,'error');
}

export function resolveScreenshotReviewPath(path:string):boolean {
  const changed=activeScreenshotReviewState.resolve(path);
  if(!changed)return false;
  renderActiveScreenshotReviewHighlights();
  updateReviewProgressStatus();
  return true;
}

export function discardScreenshotReviewState(message='Screenshot review cleared because the board changed.'):void {
  const wasActive=activeScreenshotReviewState.active;
  activeScreenshotReviewState.clear();
  clearAllReviewHighlights();
  if(wasActive)setStatus(message,'idle');
}

export function bindScreenshotImport(state:ApplicationState,callbacks:ScreenshotImportCallbacks):void {
  const button=$<HTMLButtonElement>('#screenshot-import'),input=$<HTMLInputElement>('#screenshot-file'),optimize=$<HTMLButtonElement>('#optimize'),diagnosticButton=$<HTMLButtonElement>('#screenshot-ocr-diagnostic-copy'),diagnosticToast=$('#screenshot-ocr-diagnostic-toast');
  clearDiagnostic(diagnosticButton,diagnosticToast);
  const prewarm=()=>{void warmLocalScreenshotOcr().catch(()=>undefined);};
  button.addEventListener('pointerenter',prewarm,{once:true});button.addEventListener('focus',prewarm,{once:true});
  diagnosticButton.addEventListener('click',async()=>{
    if(!latestDiagnosticJson)return;
    const writeText=navigator.clipboard?.writeText?.bind(navigator.clipboard);
    const copied=await copyDiagnosticJson(latestDiagnosticJson,writeText);
    showDiagnosticToast(diagnosticToast,copied?'Copied!':'Copy failed',copied?'success':'error');
  });
  const applyImport=(result:ValidatedScreenshotImport,elapsedMs:number):void=>{
    const paths=reviewPaths(result);
    activeScreenshotReviewState.replace(paths);
    state.importScreenshot(result.board,result.menu,result.tokensRemaining);callbacks.renderStructure();callbacks.afterApply();
    emitScreenshotImportStage({stage:'applied',value:{board:state.board,menu:state.menu,tokensRemaining:state.tokensRemaining}});
    renderActiveScreenshotReviewHighlights();
    const elapsed=elapsedMs<1000?`${Math.round(elapsedMs)} ms`:`${(elapsedMs/1000).toFixed(1)} s`;
    if(result.requiresReview){const count=paths.length;setStatus(`Imported in ${elapsed} · review ${count} flagged field${count===1?'':'s'} outlined in red before optimizing.`,'error');}
    else setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions in ${elapsed}.`,'success');
  };
  optimize.addEventListener('click',()=>{
    if(!activeScreenshotReviewState.active)return;
    activeScreenshotReviewState.clear();
    clearAllReviewHighlights();
    setStatus('Imported screenshot confirmed by optimization.','success');
  },{capture:true});
  button.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    const data=callbacks.getData();if(!data){setStatus('Tournament model is still loading.','error');return;}
    activeScreenshotReviewState.clear();clearAllReviewHighlights();
    button.disabled=true;button.textContent='Reading Screenshot…';clearDiagnostic(diagnosticButton,diagnosticToast);setStatus('Local OCR: locating board and reading visible fields…','working');
    const started=performance.now();
    try{
      const raw=await requestScreenshotImport(file,data),productionDiagnostic=getLastLocalOcrMetrics();
      emitScreenshotImportStage({stage:'raw',value:raw,localOcrMetrics:productionDiagnostic});
      const validated=validateScreenshotImport(raw,data,state.board,state.menu);
      emitScreenshotImportStage({stage:'validated',value:validated});
      if(productionDiagnostic)setDiagnostic(productionDiagnostic,diagnosticButton);
      applyImport(validated,performance.now()-started);
    }catch(error){
      activeScreenshotReviewState.clear();clearAllReviewHighlights();setStatus(error instanceof Error?error.message:String(error),'error');
      const productionDiagnostic=getLastLocalOcrMetrics();
      if(productionDiagnostic)setDiagnostic({importError:String(error),...productionDiagnostic},diagnosticButton);
      else{
        try{setDiagnostic({importError:String(error),browserOcr:await diagnoseLocalScreenshotOcr(file)},diagnosticButton);}
        catch(diagError){setDiagnostic({importError:String(error),diagnosticError:String(diagError)},diagnosticButton);}
      }
    }finally{button.disabled=false;button.textContent='Import Screenshot';}
  });
}
