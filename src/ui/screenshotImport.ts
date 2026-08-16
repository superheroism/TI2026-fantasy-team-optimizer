import type { DataBundle } from '../domain/types.js';
import { applyScreenshotReviewHighlights, clearScreenshotReviewHighlights } from './boardView.js';
import type { ApplicationState } from './state.js';
import { requestScreenshotImport, validateScreenshotImport, type ValidatedScreenshotImport } from '../import/screenshotImport.js';
import { warmLocalScreenshotOcr } from '../import/localScreenshotOcr.js';

const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector) as T;
export interface ScreenshotImportCallbacks { getData:()=>DataBundle|undefined;renderStructure:()=>void;afterApply:()=>void; }
function setStatus(text:string,kind:'idle'|'working'|'success'|'error'='idle'):void{const status=$('#screenshot-import-status');status.textContent=text;status.dataset.kind=kind;}
function reviewPaths(result:ValidatedScreenshotImport):string[]{return result.lowConfidenceFields.map(field=>field.path);}
function clearActionReviewHighlights():void{document.querySelectorAll<HTMLElement>('.op-card.screenshot-review-target-operation').forEach(card=>card.classList.remove('screenshot-review-target-operation'));}
function applyActionReviewHighlights(paths:readonly string[]):void{clearActionReviewHighlights();for(const path of paths){const match=path.match(/^operationIds\.(\d+)$/)??path.match(/^operationIds\[(\d+)\]$/);if(!match)continue;const index=Number(match[1]);if(Number.isInteger(index))document.querySelector<HTMLElement>(`.op-card[data-op="${index}"]`)?.classList.add('screenshot-review-target-operation');}}
function clearAllReviewHighlights():void{clearScreenshotReviewHighlights();clearActionReviewHighlights();}
export function bindScreenshotImport(state:ApplicationState,callbacks:ScreenshotImportCallbacks):void{
 const button=$<HTMLButtonElement>('#screenshot-import'),input=$<HTMLInputElement>('#screenshot-file'),optimize=$<HTMLButtonElement>('#optimize');
 const prewarm=()=>{void warmLocalScreenshotOcr().catch(()=>undefined);};
 button.addEventListener('pointerenter',prewarm,{once:true});button.addEventListener('focus',prewarm,{once:true});
 const applyImport=(result:ValidatedScreenshotImport,elapsedMs:number):void=>{state.importScreenshot(result.board,result.menu,result.tokensRemaining);callbacks.renderStructure();callbacks.afterApply();const paths=reviewPaths(result);applyScreenshotReviewHighlights(paths);applyActionReviewHighlights(paths);const elapsed=elapsedMs<1000?`${Math.round(elapsedMs)} ms`:`${(elapsedMs/1000).toFixed(1)} s`;if(result.requiresReview){const count=Math.max(paths.length,result.warnings.length);setStatus(`Imported in ${elapsed} · review ${count} flagged field${count===1?'':'s'} outlined in red before optimizing.`,'error');}else setStatus(`Imported ${result.board.core.emblems.length}-emblem board and three actions in ${elapsed}.`,'success');};
 optimize.addEventListener('click',()=>{clearAllReviewHighlights();if($('#screenshot-import-status').dataset.kind==='error')setStatus('Imported screenshot confirmed by optimization.','success');},{capture:true});
 button.addEventListener('click',()=>input.click());
 input.addEventListener('change',async()=>{const file=input.files?.[0];input.value='';if(!file)return;const data=callbacks.getData();if(!data){setStatus('Tournament model is still loading.','error');return;}button.disabled=true;button.textContent='Reading Screenshot…';setStatus('Local OCR: locating board and reading visible fields…','working');const started=performance.now();try{const raw=await requestScreenshotImport(file,data);applyImport(validateScreenshotImport(raw,data,state.board,state.menu),performance.now()-started);}catch(error){clearAllReviewHighlights();setStatus(error instanceof Error?error.message:String(error),'error');}finally{button.disabled=false;button.textContent='Import Screenshot';}});
}
