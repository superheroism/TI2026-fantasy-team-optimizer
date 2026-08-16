from pathlib import Path
import re

# 1) Make action OCR tolerant of stable truncated stems seen in the browser trace.
p = Path('src/import/ocrDomainMatch.ts')
s = p.read_text()
s = s.replace(
"function observedMatch(ocr:string[],target:string):number{return Math.max(0,...ocr.map(t=>ocrSimilarity(t,target)));}",
"function observedMatch(ocr:string[],target:string):number{\n  const fuzzy=Math.max(0,...ocr.map(t=>ocrSimilarity(t,target)));\n  const stems:Record<string,readonly string[]>={INCREASE:['INC'],QUALITY:['QUAL'],RANDOM:['RANDOM'],GREEN:['GRE'],RED:['RED'],BLUE:['BLU']};\n  const stemHit=(stems[target]??[]).some(stem=>ocr.some(token=>token.startsWith(stem)));\n  return stemHit?Math.max(fuzzy,.78):fuzzy;\n}"
)
p.write_text(s)

# 2) Replace the old whole-image stat-only retry with native card/team retries driven by
#    the already-recovered extraction lattice. No whole-image repeat, no upscaling.
p = Path('src/import/emblemOcrRefinement.ts')
p.write_text(r'''import type { DataBundle, Role, SlotColor, StatName } from '../domain/types.js';
import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import type { LocalScreenshotOcrMetrics } from './localScreenshotOcr.js';
import { matchStatText, matchTierText, matchTraitText, ocrSimilarity } from './ocrDomainMatch.js';
import type { RawScreenshotImport, ScreenshotFieldConfidence } from './screenshotImport.js';

const ROLES:readonly Role[]=['core','mid','support'];
interface Word{text:string;confidence:number;left:number;top:number;width:number;height:number;}
interface Worker{recognize(image:HTMLCanvasElement,options?:Record<string,unknown>,output?:Record<string,boolean>):Promise<{data:{tsv?:string}}>;setParameters(params:Record<string,unknown>):Promise<unknown>;}
interface Tess{createWorker(language?:string):Promise<Worker>;}
interface Rect{left:number;top:number;width:number;height:number;}
let workerPromise:Promise<Worker>|undefined;

function parse(tsv?:string):Word[]{if(!tsv)return[];const out:Word[]=[];for(const row of tsv.split(/\r?\n/).slice(1)){const c=row.split('\t');if(c.length<12||c[0]!=='5')continue;const text=c.slice(11).join('\t').trim();if(text)out.push({text,confidence:Number(c[10])||0,left:Number(c[6])||0,top:Number(c[7])||0,width:Number(c[8])||0,height:Number(c[9])||0});}return out;}
async function worker():Promise<Worker>{workerPromise??=(async()=>{const T=(window as unknown as {Tesseract?:Tess}).Tesseract;if(!T)throw new Error('Local OCR runtime is unavailable for emblem refinement.');const w=await T.createWorker('eng');await w.setParameters({tessedit_pageseg_mode:'6'});return w;})();return workerPromise;}
async function image(file:File):Promise<HTMLImageElement>{return await new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);ok(i);};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('Could not decode screenshot for emblem refinement.'));};i.src=u;});}
function canvas(i:HTMLImageElement,r:Rect):HTMLCanvasElement{const left=Math.max(0,Math.floor(r.left)),top=Math.max(0,Math.floor(r.top)),right=Math.min(i.naturalWidth,Math.ceil(r.left+r.width)),bottom=Math.min(i.naturalHeight,Math.ceil(r.top+r.height)),c=document.createElement('canvas');c.width=Math.max(1,right-left);c.height=Math.max(1,bottom-top);const x=c.getContext('2d');if(!x)throw new Error('Canvas unavailable.');x.drawImage(i,left,top,c.width,c.height,0,0,c.width,c.height);return c;}
function confidenceFor(raw:RawScreenshotImport,path:string):number{return raw.fieldConfidence?.find(x=>x.path===path)?.confidence??0;}
function setConfidence(raw:RawScreenshotImport,path:string,confidence:number):void{raw.fieldConfidence??=[];const old=raw.fieldConfidence.find(x=>x.path===path);if(old)old.confidence=Math.max(old.confidence,confidence);else raw.fieldConfidence.push({path,confidence} satisfies ScreenshotFieldConfidence);}
function extractionToSource(r:Rect,m:LocalScreenshotOcrMetrics):Rect{const c=m.diagnostic.sourceCrop,sx=c.width/m.extractionWidth,sy=c.height/m.extractionHeight;return{left:c.left+r.left*sx,top:c.top+r.top*sy,width:r.width*sx,height:r.height*sy};}
function orderedText(ws:readonly Word[]):string{return[...ws].sort((a,b)=>a.top-b.top||a.left-b.left).map(w=>w.text).join(' ');}
function ocrConfidence(ws:readonly Word[]):number{return ws.length?ws.reduce((sum,w)=>sum+w.confidence,0)/ws.length/100:0;}
function combined(match:number,ws:readonly Word[]):number{return Math.max(0,Math.min(.99,match*.82+ocrConfidence(ws)*.18));}
function phrases(s:string,maxWords=3):string[]{const t=s.toUpperCase().match(/[A-Z0-9_-]+/g)??[],out=[...t];for(let n=2;n<=Math.min(maxWords,t.length);n++)for(let i=0;i<=t.length-n;i++)out.push(t.slice(i,i+n).join(' '));return out;}
function teamMatch(s:string,role:Role,data:DataBundle):{team:string;score:number}{let best={team:data.players.find(p=>p.role===role)?.team??'',score:0};const ps=phrases(s,3);for(const p of data.players.filter(x=>x.role===role)){const names=[p.name,...p.attachedPlayers],scores=names.map(name=>Math.max(0,...ps.map(x=>ocrSimilarity(x,name)))).sort((a,b)=>b-a),strong=scores.filter(x=>x>=.62),score=strong.length>=2?Math.min(.99,(strong[0]!+strong[1]!)/2):scores[0]??0;if(score>best.score)best={team:p.team,score};}return best;}

export interface ScreenshotRefinementResult{result:RawScreenshotImport;elapsedMs:number;retries:number;}

/**
 * Retry only unresolved structured fields from small native-resolution regions derived
 * from the extraction lattice. This deliberately avoids a second whole-image OCR pass.
 */
export async function refineUncertainScreenshotFields(file:File,data:DataBundle,raw:RawScreenshotImport,metrics:LocalScreenshotOcrMetrics):Promise<ScreenshotRefinementResult>{
  const started=performance.now(),src=await image(file),w=await worker(),layout=BOARD_LAYOUTS[raw.layoutId];let retries=0;
  const diagnostics=new Map(metrics.diagnostic.emblems.map(e=>[`${e.role}:${e.rowIndex}`,e] as const));
  for(const role of ROLES){
    for(let i=0;i<layout.roles[role].length;i++){
      const sp=`banners.${role}.emblems.${i}.stat`,qp=`banners.${role}.emblems.${i}.qualityTier`,tp=`banners.${role}.emblems.${i}.trait`;
      if(Math.min(confidenceFor(raw,sp),confidenceFor(raw,qp),confidenceFor(raw,tp))>=.9)continue;
      const d=diagnostics.get(`${role}:${i}`);if(!d)continue;
      const rr=extractionToSource({left:Math.max(0,d.roi.left-d.roi.width*.08),top:Math.max(0,d.roi.top-d.roi.height*.08),width:d.roi.width*1.13,height:d.roi.height*1.16},metrics);
      const rec=await w.recognize(canvas(src,rr),{tessedit_pageseg_mode:'6'},{tsv:true}),words=parse(rec.data.tsv),s=orderedText(words);retries++;
      const slot=layout.roles[role][i]!,sm=matchStatText(s,LEGAL_STAT_POOLS[slot.color]),tm=matchTraitText(s),qm=matchTierText(s),sc=combined(sm.score,words),tc=combined(tm.score,words),qc=combined(qm.score,words);
      if(sm.score>=.58&&sc>confidenceFor(raw,sp)){raw.banners[role].emblems[i]!.stat=sm.value;setConfidence(raw,sp,sc);}
      if(tm.score>=.62&&tc>confidenceFor(raw,tp)){raw.banners[role].emblems[i]!.trait=tm.value;setConfidence(raw,tp,tc);}
      if(qm.score>=.72&&qc>confidenceFor(raw,qp)){raw.banners[role].emblems[i]!.qualityTier=qm.value;setConfidence(raw,qp,qc);}
    }
  }

  // Team/player text is smaller than emblem text. Retry only roles whose initial evidence
  // was weak, using the non-emblem side of the recovered banner band at native pixels.
  const rows=metrics.diagnostic.globalRows,pitch=rows.length>1?rows[1]!-rows[0]!:Math.max(55,metrics.extractionHeight*.08),first=rows[0]??metrics.extractionHeight*.12;
  for(const role of ROLES){const path=`banners.${role}.selectedTeam`;if(confidenceFor(raw,path)>=.9)continue;const band=metrics.diagnostic.columnBands[role],bw=band.right-band.left,rect=extractionToSource({left:Math.max(0,band.left-bw*.05),top:0,width:bw*.48,height:Math.min(metrics.extractionHeight,first+pitch*.9)},metrics),rec=await w.recognize(canvas(src,rect),{tessedit_pageseg_mode:'6'},{tsv:true}),words=parse(rec.data.tsv),match=teamMatch(orderedText(words),role,data),confidence=combined(match.score,words);retries++;if(match.score>=.62&&confidence>confidenceFor(raw,path)){raw.banners[role].selectedTeam=match.team;setConfidence(raw,path,confidence);}}
  return{result:raw,elapsedMs:performance.now()-started,retries};
}

// Compatibility export for older callers; the production path now supplies geometry metrics.
export async function refineUncertainEmblemStats(file:File,data:DataBundle,raw:RawScreenshotImport):Promise<RawScreenshotImport>{void file;void data;return raw;}
''')

# 3) Make the local parser's confidence reflect recovered extraction geometry, and add a
#    single source-resolution token footer retry when extraction OCR misses the count.
p = Path('src/import/localScreenshotOcr.ts')
s = p.read_text()
s = s.replace(
"const geometryConfidenceCap = localGeometry.method === 'fallback' || extractionGeometry.method === 'fallback' ? .85 : 1;",
"const geometryConfidenceCap = extractionGeometry.method === 'fallback' || pooledResult.synthesized ? .85 : localGeometry.method === 'fallback' ? .92 : 1;"
)
old = "const actionRows=pooled.length?pooled:ROLES.flatMap(r=>rows[r]),actions=await parseActions(worker,img,ex,crop,actionRows,fc,warnings),tokens=tokenCount(ex.words),result:RawScreenshotImport={layoutId,banners,operationIds:actions.ops,fieldConfidence:fc,warnings};if(tokens){result.tokensRemaining=tokens.value;fc.push({path:'tokensRemaining',confidence:tokens.confidence});}"
new = "const actionRows=pooled.length?pooled:ROLES.flatMap(r=>rows[r]),actions=await parseActions(worker,img,ex,crop,actionRows,fc,warnings);let tokens=tokenCount(ex.words),tokenRetryMs=0;if(!tokens){const ag=actionGeometry(ex,actionRows);if(ag){const pitch=actionRows.length>1?actionRows.slice(1).map((y,i)=>y-actionRows[i]!).sort((a,b)=>a-b)[Math.floor((actionRows.length-1)/2)]!:Math.max(55,ex.height*.08),r={left:Math.max(0,ag.cards[1]!.left),top:Math.max(0,ag.anchorY-pitch*.4),width:Math.min(ex.width-ag.cards[1]!.left,ag.cards[1]!.width*2.35),height:Math.min(ex.height-(ag.anchorY-pitch*.4),pitch*.95)},sr=sourceRect(r,crop,ex,img.naturalWidth,img.naturalHeight),retry=await run(worker,canvas(img,Number.POSITIVE_INFINITY,sr));tokenRetryMs=retry.elapsedMs;tokens=tokenCount(retry.words);}}const result:RawScreenshotImport={layoutId,banners,operationIds:actions.ops,fieldConfidence:fc,warnings};if(tokens){result.tokensRemaining=tokens.value;fc.push({path:'tokensRemaining',confidence:tokens.confidence});}else{fc.push({path:'tokensRemaining',confidence:0});warnings.push('Roll token count is missing or unreadable.');}"
if old not in s: raise SystemExit('local parser token block not found')
s = s.replace(old,new)
s = s.replace("targetedRetryMs:actions.extraMs,totalMs:","targetedRetryMs:actions.extraMs+tokenRetryMs,totalMs:")
p.write_text(s)

# 4) Feed production geometry into native retries and include their latency in the exposed metrics.
p = Path('src/import/screenshotImport.ts')
s = p.read_text()
s = s.replace("import { refineUncertainEmblemStats } from './emblemOcrRefinement.js';","import { refineUncertainScreenshotFields } from './emblemOcrRefinement.js';")
old = "export async function requestScreenshotImport(file:File,data:DataBundle):Promise<RawScreenshotImport>{lastLocalOcrMetrics=undefined;try{const local=await parseScreenshotLocally(file,data);lastLocalOcrMetrics=local.metrics;return await refineUncertainEmblemStats(file,data,local.result);}catch(localError){"
new = "export async function requestScreenshotImport(file:File,data:DataBundle):Promise<RawScreenshotImport>{lastLocalOcrMetrics=undefined;try{const local=await parseScreenshotLocally(file,data),refined=await refineUncertainScreenshotFields(file,data,local.result,local.metrics);local.metrics.targetedRetryMs+=refined.elapsedMs;local.metrics.totalMs+=refined.elapsedMs;lastLocalOcrMetrics=local.metrics;return refined.result;}catch(localError){"
if old not in s: raise SystemExit('screenshot import production block not found')
s = s.replace(old,new)
p.write_text(s)

# 5) Deterministic regressions: require the noisy quality action to clear the production
#    acceptance threshold and document the refined confidence policy.
p = Path('tests/ocr-domain-match.test.mjs')
s = p.read_text()
s = s.replace("assert.equal(matchActionText('RANDOMLY \\\"od ne QUALIT INCH')?.id, 'quality-increase-one');", "const quality = matchActionText('RANDOMLY \\\"od ne QUALIT INCH');\n  assert.equal(quality?.id, 'quality-increase-one');\n  assert.ok((quality?.score ?? 0) >= .58);")
p.write_text(s)

Path('SCREENSHOT_OCR_LIVE_VALIDATION_2026-08-16_FOLLOWUP.md').write_text('''# Screenshot OCR live follow-up — 2026-08-16\n\n## Browser result after PR #40\n\nThe same 2560×1600 phone-browser fixture was rerun after the token-aware extraction fix. The rerun confirmed that the safety-critical `130% -> 30% -> Tier II @ 0.99` error is gone. Explicit OCR tokens now survive normalization (`DEATHS`, `GPM`, `FRIENDLY`, `VAMPIRIC`), and action cards 1 and 3 resolve correctly.\n\nThe extraction lattice remained stable: card-anchor clustering recovered all three columns, three observed rows, `legacy_3`, and no synthesized rows. This confirms that another wholesale geometry rewrite is not justified by this fixture.\n\n## Remaining failures\n\nSeveral small card fields remain unreadable in the 1440 px extraction pass, especially quality numerals/bonuses and short stat titles. Core/Mid team evidence is also too small at extraction resolution. The middle action is correctly ranked as `quality-increase-one` but its noisy browser string scores about 0.56, just below the production 0.58 acceptance gate. Token count is not present in extraction OCR despite being visible in the source.\n\n## Follow-up correction\n\n- Retry only unresolved emblem cards from small native-resolution ROIs mapped from the recovered extraction lattice; one card retry supplies stat, tier, and trait evidence together.\n- Retry weak team/player regions at native resolution.\n- Keep the action catalog constraint, but recognize stable truncated OCR stems such as `INC*` for `INCREASE`; the noisy live string must clear the existing 0.58 gate rather than lowering the gate globally.\n- When token count is absent, run one native footer retry derived from the observed action anchor.\n- Do not repeat full-resolution whole-image OCR and do not upscale.\n- A localization fallback followed by independently observed extraction columns/rows now receives a 0.92 confidence cap; extraction fallback or synthesized rows retain the stricter 0.85 cap. Thus fallback remains visible without forcing every independently recovered exact emblem value below the review threshold.\n\nThis PR remains browser-gated: CI validates deterministic behavior and generated artifacts, but the same live fixture must be rerun before a merge recommendation.\n''')
