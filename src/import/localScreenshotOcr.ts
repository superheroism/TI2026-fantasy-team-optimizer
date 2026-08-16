import type { BoardLayoutId, DataBundle, QualityTier, Role, StatName, TraitName } from '../domain/types.js';
import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import type { RawScreenshotImport, ScreenshotFieldConfidence } from './screenshotImport.js';
import { matchActionText, matchStatText, matchTierText, matchTraitText } from './ocrDomainMatch.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const TRAITS: readonly TraitName[] = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const OCR_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
const LOCALIZE_MAX = 1100;
const EXTRACT_MAX = 1440;
const DIRECT_NATIVE_MAX_PIXELS = 2_000_000;
const REVIEW_THRESHOLD = .9;

interface Word { text:string; confidence:number; left:number; top:number; width:number; height:number; lineKey:string; }
interface Pass { words:Word[]; elapsedMs:number; width:number; height:number; }
interface Rect { left:number; top:number; width:number; height:number; }
interface Band { left:number; right:number; }
interface Worker { recognize(image:HTMLCanvasElement|File, options?:Record<string,unknown>, output?:Record<string,boolean>):Promise<{data:{text?:string;tsv?:string}}>; setParameters(params:Record<string,unknown>):Promise<unknown>; }
interface Tess { createWorker(language?:string):Promise<Worker>; }
declare global { interface Window { Tesseract?:Tess; } }

export interface OcrWordDiagnostic { text:string; confidence:number; x:number; y:number; }
export interface RoleCandidateDiagnostic extends OcrWordDiagnostic { role:Role; similarity:number; }
export interface CardAnchorDiagnostic extends OcrWordDiagnostic { similarity:number; }
export interface TierCandidateDiagnostic extends OcrWordDiagnostic { role:Role; similarity:number; }
export interface EmblemOcrDiagnostic {
  role:Role;
  rowIndex:number;
  roi:Rect;
  synthesizedRow:boolean;
  words:OcrWordDiagnostic[];
  inferredColor:string;
  rawText:string;
  normalizedStat:string;
  statMatchScore:number;
  rawTierText:string;
  normalizedTier:number;
  tierMatchScore:number;
  rawTraitText:string;
  normalizedTrait:string;
  traitMatchScore:number;
  finalConfidence:number;
  reviewRequired:boolean;
}
export interface ScreenshotGeometryDiagnostic {
  localizationWordCount:number;
  extractionWordCount:number;
  roleCandidates:RoleCandidateDiagnostic[];
  cardAnchors:CardAnchorDiagnostic[];
  columnLocalizationMethod:'role-labels'|'card-anchor-clustering'|'fallback';
  localizationColumnCenters:Record<Role,number>;
  localizationCrop:Rect;
  sourceCrop:Rect;
  extractionColumnMethod:'role-labels'|'card-anchor-clustering'|'fallback';
  extractionColumnCenters:Record<Role,number>;
  columnBands:Record<Role,Band>;
  tierCandidates:TierCandidateDiagnostic[];
  tierRowsByColumn:Record<Role,number[]>;
  globalRows:number[];
  inferredLayout:BoardLayoutId;
  synthesizedRows:boolean;
  emblems:EmblemOcrDiagnostic[];
  teamEvidence:Record<Role,{rawText:string; normalizedTeam:string; matchScore:number}>;
  actionEvidence:{resolved:(string|null)[]; reason:string; cardTexts:string[]};
  tokenEvidence:{rawText:string; value:number|null; confidence:number};
}
export interface LocalScreenshotOcrMetrics {
  sourceWidth:number;
  sourceHeight:number;
  localizationWidth:number;
  localizationHeight:number;
  extractionWidth:number;
  extractionHeight:number;
  localizationMs:number;
  extractionMs:number;
  targetedRetryMs:number;
  totalMs:number;
  croppedPixelFraction:number;
  processedPixels:{localization:number; extraction:number};
  diagnostic:ScreenshotGeometryDiagnostic;
}
export interface LocalScreenshotOcrOutput { result:RawScreenshotImport; metrics:LocalScreenshotOcrMetrics; }

let workerPromise:Promise<Worker>|undefined;
const ALIASES:Record<StatName,string[]> = {
  'Creep Score':['CREEP SCORE','CREEP'], GPM:['GPM'], Deaths:['DEATHS'], 'Tower Kills':['TOWER KILLS','TOWER'],
  Madstone:['MADSTONE COLLECTED','MADSTONE'], Kills:['KILLS'], 'Teamfight Participation':['TEAMFIGHT PARTICIPATION','TEAMFIGHT'],
  'Tormentor Kills':['TORMENTOR KILLS','TORMENTOR'], 'Roshan Kills':['ROSHAN KILLS','ROSHAN'], Stuns:['STUNS'],
  'Courier Kills':['COURIER KILLS','COURIER'], 'First Blood':['FIRST BLOOD'], Runes:['RUNES GRABBED','RUNES'],
  Watchers:['WATCHERS'], 'Wards Placed':['WARDS PLACED','WARDS'], 'Smokes Used':['SMOKES USED','SMOKES'],
  'Camps Stacked':['CAMPS STACKED','CAMPS'], Lotuses:['LOTUSES'],
};
const CARD_ANCHORS = [...new Set([...TRAITS, 'TIER', ...Object.values(ALIASES).flat().flatMap(x => x.split(/\s+/))])];
const norm = (s:string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
function distance(a:string,b:string):number { const p=Array.from({length:b.length+1},(_,i)=>i),n=new Array<number>(b.length+1); for(let i=1;i<=a.length;i++){n[0]=i;for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]!+1,p[j]!+1,p[j-1]!+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)p[j]=n[j]!;} return p[b.length]!; }
function sim(a:string,b:string):number { const x=norm(a),y=norm(b); if(!x||!y)return 0; if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length); return 1-distance(x,y)/Math.max(x.length,y.length); }
const cx=(w:Word)=>w.left+w.width/2;
const cy=(w:Word)=>w.top+w.height/2;
const text=(ws:readonly Word[])=>[...ws].sort((a,b)=>a.left-b.left).map(w=>w.text).join(' ');
const wordDiagnostic=(w:Word):OcrWordDiagnostic=>({text:w.text,confidence:w.confidence,x:cx(w),y:cy(w)});
function groups(ws:readonly Word[]):Map<string,Word[]> { const m=new Map<string,Word[]>(); for(const w of ws){const r=m.get(w.lineKey)??[];r.push(w);m.set(w.lineKey,r);} return m; }

async function runtime():Promise<Tess>{if(window.Tesseract)return window.Tesseract;await new Promise<void>((ok,no)=>{const old=document.querySelector<HTMLScriptElement>('script[data-local-ocr]');if(old){old.addEventListener('load',()=>ok(),{once:true});old.addEventListener('error',()=>no(new Error('Local OCR failed to load.')),{once:true});return;}const s=document.createElement('script');s.src=OCR_CDN;s.async=true;s.dataset.localOcr='1';s.onload=()=>ok();s.onerror=()=>no(new Error('Local OCR failed to load.'));document.head.appendChild(s);});if(!window.Tesseract)throw new Error('Local OCR runtime is unavailable.');return window.Tesseract;}
async function getWorker():Promise<Worker>{workerPromise??=(async()=>{const T=await runtime(),w=await T.createWorker('eng');await w.setParameters({tessedit_pageseg_mode:'3'});return w;})();return await workerPromise;}
export interface BrowserOcrDiagnostic { sourceWidth:number;sourceHeight:number;fileType:string;fileBytes:number;elapsedMs:number;textLength:number;tsvLength:number;tsvLines:number;parsedWordCount:number;sampleText:string;sampleWords:string[]; }
export async function diagnoseLocalScreenshotOcr(file:File):Promise<BrowserOcrDiagnostic>{const img=await decode(file),w=await getWorker(),started=performance.now();const r=await w.recognize(file,{}, {tsv:true});const rawText=r.data.text??'',rawTsv=r.data.tsv??'',words=parse(rawTsv);return{sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight,fileType:file.type,fileBytes:file.size,elapsedMs:performance.now()-started,textLength:rawText.length,tsvLength:rawTsv.length,tsvLines:rawTsv?rawTsv.split(/\r?\n/).length:0,parsedWordCount:words.length,sampleText:rawText.replace(/\s+/g,' ').trim().slice(0,500),sampleWords:words.slice(0,30).map(x=>x.text)};}
export async function warmLocalScreenshotOcr():Promise<void>{await getWorker();}
async function decode(file:File):Promise<HTMLImageElement>{if(!file.type.startsWith('image/'))throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');return await new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);ok(i);};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('The selected screenshot could not be decoded.'));};i.src=u;});}
function canvas(i:HTMLImageElement,max:number,c?:Rect):HTMLCanvasElement{const s=c??{left:0,top:0,width:i.naturalWidth,height:i.naturalHeight},k=Math.min(1,max/Math.max(s.width,s.height)),o=document.createElement('canvas');o.width=Math.max(1,Math.round(s.width*k));o.height=Math.max(1,Math.round(s.height*k));const x=o.getContext('2d');if(!x)throw new Error('Canvas image processing is unavailable.');x.drawImage(i,s.left,s.top,s.width,s.height,0,0,o.width,o.height);return o;}
function parse(tsv?:string):Word[]{if(!tsv)return[];const out:Word[]=[];for(const row of tsv.split(/\r?\n/).slice(1)){const c=row.split('\t');if(c.length<12||c[0]!=='5')continue;const t=c.slice(11).join('\t').trim();if(t)out.push({text:t,confidence:Number(c[10])||0,left:Number(c[6])||0,top:Number(c[7])||0,width:Number(c[8])||0,height:Number(c[9])||0,lineKey:`${c[1]}:${c[2]}:${c[3]}:${c[4]}`});}return out;}
async function run(w:Worker,c:HTMLCanvasElement):Promise<Pass>{const t=performance.now(),r=await w.recognize(c,{}, {tsv:true});return{words:parse(r.data.tsv),elapsedMs:performance.now()-t,width:c.width,height:c.height};}
function cropRecognizedPass(p:Pass,c:Rect):Pass{const words=p.words.filter(w=>cx(w)>=c.left&&cx(w)<c.left+c.width&&cy(w)>=c.top&&cy(w)<c.top+c.height).map(w=>({...w,left:w.left-c.left,top:w.top-c.top}));return{words,elapsedMs:0,width:c.width,height:c.height};}
function cardAnchorScore(w:Word):number{return Math.max(...CARD_ANCHORS.map(a=>sim(w.text,a)));}
function cardAnchor(w:Word):boolean{return cardAnchorScore(w)>=.72;}
function cluster3(xs:number[],width:number):number[]|null{if(xs.length<6)return null;const c=[...xs].sort((a,b)=>a-b);let m=[c[Math.floor(c.length*.15)]!,c[Math.floor(c.length*.5)]!,c[Math.floor(c.length*.85)]!];for(let it=0;it<12;it++){const g:[number[],number[],number[]]=[[],[],[]];for(const x of c){let j=0;if(Math.abs(x-m[1]!)<Math.abs(x-m[j]!))j=1;if(Math.abs(x-m[2]!)<Math.abs(x-m[j]!))j=2;g[j]!.push(x);}if(g.some(x=>x.length<2))return null;m=g.map((x,i)=>x.length?x.reduce((a,b)=>a+b,0)/x.length:m[i]!) as [number,number,number];m.sort((a,b)=>a-b);}if(m[2]!-m[0]!<width*.35)return null;const d1=m[1]!-m[0]!,d2=m[2]!-m[1]!;if(Math.min(d1,d2)/Math.max(d1,d2)<.55)return null;return m;}
interface CenterResult { centers:Record<Role,number>; method:'role-labels'|'card-anchor-clustering'|'fallback'; roleCandidates:RoleCandidateDiagnostic[]; cardAnchors:CardAnchorDiagnostic[]; }
function centerResult(ws:readonly Word[],width:number):CenterResult{const f={} as Partial<Record<Role,number>>,roleCandidates:RoleCandidateDiagnostic[]=[];for(const r of ROLES){const a=ws.map(w=>({w,similarity:sim(w.text,r.toUpperCase())})).filter(x=>x.similarity>=.72).sort((x,y)=>y.w.confidence-x.w.confidence);for(const x of a)roleCandidates.push({...wordDiagnostic(x.w),role:r,similarity:x.similarity});if(a[0])f[r]=cx(a[0].w);}const anchors=ws.map(w=>({w,similarity:cardAnchorScore(w)})).filter(x=>x.similarity>=.72).map(x=>({...wordDiagnostic(x.w),similarity:x.similarity}));if(Object.keys(f).length===3)return{centers:f as Record<Role,number>,method:'role-labels',roleCandidates,cardAnchors:anchors};const clustered=cluster3(anchors.map(x=>x.x),width);if(clustered)return{centers:{core:clustered[0]!,mid:clustered[1]!,support:clustered[2]!},method:'card-anchor-clustering',roleCandidates,cardAnchors:anchors};return{centers:{core:width/6,mid:width/2,support:width*5/6},method:'fallback',roleCandidates,cardAnchors:anchors};}
function cropBox(p:Pass,sw:number,sh:number){const g=centerResult(p.words,p.width),c=g.centers,d=Math.min(c.mid-c.core,c.support-c.mid),l=Math.max(0,c.core-d*.62),r=Math.min(p.width,c.support+d*.62),h=p.words.filter(w=>ROLES.some(x=>sim(w.text,x.toUpperCase())>=.72)),card=p.words.filter(cardAnchor),topEvidence=h.length?h:card,t=topEvidence.length?Math.max(0,Math.min(...topEvidence.map(w=>w.top))-Math.max(20,p.height*.05)):0,sx=sw/p.width,sy=sh/p.height,localization={left:l,top:t,width:r-l,height:p.height-t},source={left:Math.floor(l*sx),top:Math.floor(t*sy),width:Math.ceil((r-l)*sx),height:Math.ceil(sh-t*sy)};return{source,localization,geometry:g};}
function bandsFromCenters(c:Record<Role,number>,width:number):Record<Role,Band>{const a=(c.core+c.mid)/2,b=(c.mid+c.support)/2;return{core:{left:Math.max(0,c.core-(a-c.core)*1.05),right:a},mid:{left:a,right:b},support:{left:b,right:Math.min(width,c.support+(c.support-b)*1.05)}};}
function clusteredYs(ys:number[],tolerance:number):number[]{const s=[...ys].sort((a,b)=>a-b),g:number[]=[];for(const y of s){if(!g.length||Math.abs(y-g.at(-1)!)>tolerance)g.push(y);else g[g.length-1]=(g.at(-1)!+y)/2;}return g;}
function tierWords(ws:readonly Word[],b:Band):Word[]{return ws.filter(w=>cx(w)>=b.left&&cx(w)<b.right&&sim(w.text,'TIER')>=.65);}
function tiers(ws:readonly Word[],b:Band,height:number):number[]{const tol=Math.max(10,Math.min(22,height*.018));return clusteredYs(tierWords(ws,b).map(cy),tol);}
function globalRows(ws:readonly Word[],bs:Record<Role,Band>,height:number):{rows:number[];synthesized:boolean}{const per=ROLES.map(r=>tiers(ws,bs[r],height)),all=clusteredYs(per.flat(),Math.max(10,Math.min(22,height*.018)));if(all.length>=5)return{rows:all.slice(0,5),synthesized:false};if(all.length===4){const diffs=all.slice(1).map((y,i)=>y-all[i]!),sorted=[...diffs].sort((a,b)=>a-b),pitch=sorted[Math.floor(sorted.length/2)]!;let gap=-1;for(let i=0;i<diffs.length;i++)if(diffs[i]!>pitch*1.55)gap=i;if(gap>=0)return{rows:[...all.slice(0,gap+1),(all[gap]!+all[gap+1]!)/2,...all.slice(gap+1)].slice(0,5),synthesized:true};return{rows:[...all,all.at(-1)!+pitch],synthesized:true};}return{rows:all,synthesized:false};}
function layoutOf(r:Record<Role,number[]>,g:number[]):BoardLayoutId{const n=ROLES.map(x=>r[x].length);if(g.length>=5||n.some(x=>x>=4)||n.filter(x=>x>=5).length>=2)return'expanded_5';if(g.length>=3||n.filter(x=>x>=3).length>=2)return'legacy_3';return Math.max(...n)>=5?'expanded_5':'legacy_3';}
const within=(ws:readonly Word[],l:number,r:number,t:number,b:number)=>ws.filter(w=>cx(w)>=l&&cx(w)<r&&cy(w)>=t&&cy(w)<b);
function statMatch(s:string,legal:readonly StatName[]){return matchStatText(s,legal);}
function traitMatch(s:string){return matchTraitText(s);}
function tierMatch(s:string):{value:QualityTier;score:number}{return matchTierText(s);}
function conf(score:number,ws:readonly Word[]):number{const o=ws.length?ws.reduce((s,w)=>s+w.confidence,0)/ws.length/100:0;return Math.max(0,Math.min(.99,score*.72+o*.28));}
function teamMatch(ws:readonly Word[],role:Role,data:DataBundle){const s=text(ws);let best={team:data.players.find(p=>p.role===role)?.team??'',score:-1};for(const p of data.players.filter(x=>x.role===role)){const q=[p.name,...p.attachedPlayers].map(n=>sim(s,n)),strong=q.filter(x=>x>.62),score=strong.length?Math.min(.99,strong.reduce((a,b)=>a+b,0)/Math.min(2,strong.length)):Math.max(...q,0);if(score>best.score)best={team:p.team,score};}return best;}
function rowWindow(rows:number[],i:number,height:number){const synthesized=rows[i]===undefined,y=rows[i]??height*(.18+i*.14),prev=i?rows[i-1]!:Math.max(0,y-55),next=i<rows.length-1?rows[i+1]!:Math.min(height,y+65);return{top:i?(prev!+y)/2:Math.max(0,y-(next!-y)*.55),bottom:i<rows.length-1?(y+next!)/2:Math.min(height,y+(y-prev!)*.65),synthesized};}
function actionMatch(s:string){return matchActionText(s);}
function lineRecords(ws:readonly Word[]){return [...groups(ws).values()].map(words=>({words,s:text(words),y:words.reduce((a,w)=>a+cy(w),0)/words.length,x:words.reduce((a,w)=>a+cx(w),0)/words.length}));}
function tokenCount(ws:readonly Word[]):{value:number;confidence:number;rawText:string}|undefined{for(const line of lineRecords(ws)){if(!norm(line.s).includes('ROLLTOKENS'))continue;const m=line.s.match(/ROLL\s*TOKENS?\s*[:\-]?\s*(\d+)/i)??line.s.match(/(\d+)\s*$/);if(m)return{value:Number(m[1]),confidence:.97,rawText:line.s};}const anchors=ws.filter(w=>sim(w.text,'TOKENS')>.68);for(const a of anchors){const nums=ws.filter(w=>cy(w)>a.top-a.height&&cy(w)<a.top+a.height*2&&cx(w)>cx(a)&&cx(w)<cx(a)+Math.max(100,a.height*12)&&/^\d+$/.test(w.text));if(nums[0])return{value:Number(nums[0].text),confidence:Math.min(.95,nums[0].confidence/100),rawText:`${a.text} ${nums[0].text}`};}return undefined;}
function actionGeometry(ex:Pass,rows:number[]):{cards:Rect[];anchorY:number}|undefined{const lines=lineRecords(ex.words),anchor=lines.filter(l=>norm(l.s).includes('REROLLOPERATIONS')||norm(l.s).includes('ROLLTOKENS')).sort((a,b)=>b.y-a.y)[0];if(!anchor)return undefined;const c=centerResult(ex.words,ex.width).centers,d=Math.min(c.mid-c.core,c.support-c.mid),pitch=rows.length>1?rows.slice(1).map((y,i)=>y-rows[i]!).sort((a,b)=>a-b)[Math.floor((rows.length-1)/2)]!:Math.max(55,ex.height*.08),total=Math.min(ex.width*.8,d*1.9),center=norm(anchor.s).includes('REROLLOPERATIONS')?anchor.x:c.mid,left=Math.max(0,center-total/2),top=Math.max(0,anchor.y-pitch*1.15),height=Math.max(32,pitch*.78),gap=Math.max(4,total*.012),cardW=(total-gap*2)/3;return{cards:[0,1,2].map(i=>({left:left+i*(cardW+gap),top,width:cardW,height})),anchorY:anchor.y};}
function sourceRect(r:Rect,crop:Rect,ex:Pass,sw:number,sh:number):Rect{const sx=crop.width/ex.width,sy=crop.height/ex.height;const left=Math.max(0,Math.floor(crop.left+r.left*sx)),top=Math.max(0,Math.floor(crop.top+r.top*sy)),right=Math.min(sw,Math.ceil(crop.left+(r.left+r.width)*sx)),bottom=Math.min(sh,Math.ceil(crop.top+(r.top+r.height)*sy));return{left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)};}
async function parseActions(worker:Worker,img:HTMLImageElement,ex:Pass,crop:Rect,rows:number[],fc:ScreenshotFieldConfidence[],warnings:string[]):Promise<{ops:[string|null,string|null,string|null];extraMs:number;cardTexts:string[];reason:string}>{const ops:[string|null,string|null,string|null]=[null,null,null],g=actionGeometry(ex,rows),cardTexts=['','',''];if(!g){for(let i=0;i<3;i++){fc.push({path:`operationIds.${i}`,confidence:0});warnings.push(`Action ${i+1} is missing or unreadable.`);}return{ops,extraMs:0,cardTexts,reason:'action-region-anchor-not-found'};}let extraMs=0;for(let i=0;i<3;i++){const r=g.cards[i]!,existing=within(ex.words,r.left,r.left+r.width,r.top,r.top+r.height);cardTexts[i]=text(existing);let best=actionMatch(cardTexts[i]!);if(!best||best.score<.82){const sr=sourceRect(r,crop,ex,img.naturalWidth,img.naturalHeight),p=await run(worker,canvas(img,Number.POSITIVE_INFINITY,sr));extraMs+=p.elapsedMs;cardTexts[i]=text(p.words);best=actionMatch(cardTexts[i]!);}if(best&&best.score>=.58){ops[i]=best.id;fc.push({path:`operationIds.${i}`,confidence:best.score});if(best.score<.9)warnings.push(`Action ${i+1} OCR should be reviewed.`);}else{fc.push({path:`operationIds.${i}`,confidence:0});warnings.push(`Action ${i+1} is missing or unreadable.`);}}if(new Set(ops.filter((x):x is string=>x!==null)).size!==ops.filter(x=>x!==null).length){for(let i=0;i<3;i++){ops[i]=null;fc.push({path:`operationIds.${i}`,confidence:0});}warnings.push('Reroll actions could not be uniquely resolved.');return{ops,extraMs,cardTexts,reason:'action-candidates-not-unique'};}return{ops,extraMs,cardTexts,reason:ops.every(Boolean)?'resolved':'one-or-more-actions-unresolved'};}

export async function parseScreenshotLocally(file:File,data:DataBundle):Promise<LocalScreenshotOcrOutput>{
  const start=performance.now(),img=await decode(file),worker=await getWorker(),nativePixels=img.naturalWidth*img.naturalHeight;
  let local:Pass,ex:Pass,crop:Rect,localizationCrop:Rect,localGeometry:CenterResult;
  if(nativePixels<=DIRECT_NATIVE_MAX_PIXELS){const native=canvas(img,Number.POSITIVE_INFINITY);local=await run(worker,native);const box=cropBox(local,img.naturalWidth,img.naturalHeight);crop=box.source;localizationCrop=box.localization;localGeometry=box.geometry;ex=cropRecognizedPass(local,crop);}
  else{const lc=canvas(img,LOCALIZE_MAX);local=await run(worker,lc);const box=cropBox(local,img.naturalWidth,img.naturalHeight);crop=box.source;localizationCrop=box.localization;localGeometry=box.geometry;const ec=canvas(img,EXTRACT_MAX,crop);ex=await run(worker,ec);}

  const extractionGeometry=centerResult(ex.words,ex.width),bs=bandsFromCenters(extractionGeometry.centers,ex.width),detected=Object.fromEntries(ROLES.map(r=>[r,tiers(ex.words,bs[r],ex.height)])) as Record<Role,number[]>,pooledResult=globalRows(ex.words,bs,ex.height),pooled=pooledResult.rows,layoutId=layoutOf(detected,pooled),layout=BOARD_LAYOUTS[layoutId],rows=Object.fromEntries(ROLES.map(r=>[r,(layoutId==='expanded_5'&&pooled.length>=5)||(layoutId==='legacy_3'&&pooled.length>=3)?pooled.slice(0,layout.roles[r].length):detected[r]])) as Record<Role,number[]>;
  const fc:ScreenshotFieldConfidence[]=[],warnings:string[]=[],banners={} as RawScreenshotImport['banners'],emblemDiagnostics:EmblemOcrDiagnostic[]=[],teamEvidence={} as ScreenshotGeometryDiagnostic['teamEvidence'];
  const geometryConfidenceCap=localGeometry.method==='fallback'||extractionGeometry.method==='fallback'?.85:1;
  if(localGeometry.method==='fallback') warnings.push('Board localization used conservative fallback geometry; imported board fields require review.');
  if(extractionGeometry.method==='fallback') warnings.push('Board columns used conservative fallback geometry; imported board fields require review.');
  let synthesizedRows=pooledResult.synthesized;
  for(const role of ROLES){const b=bs[role],rs=rows[role],first=rs[0]??ex.height*.2,bandWidth=b.right-b.left,emblemLeft=b.left+bandWidth*.42,pitch=rs.length>1?Math.abs(rs[1]!-rs[0]!):Math.max(55,ex.height*.08),tw=within(ex.words,Math.max(0,b.left-bandWidth*.08),Math.max(b.left,emblemLeft-bandWidth*.03),0,Math.min(ex.height,first+pitch*.7)),tm=teamMatch(tw,role,data),teamConfidence=Math.min(tm.score,geometryConfidenceCap);teamEvidence[role]={rawText:text(tw),normalizedTeam:tm.team,matchScore:tm.score};fc.push({path:`banners.${role}.selectedTeam`,confidence:teamConfidence});if(teamConfidence<.9)warnings.push(`${role} team OCR should be reviewed.`);const emblems=layout.roles[role].map((slot,i)=>{const rw=rowWindow(rs,i,ex.height);synthesizedRows ||= rw.synthesized;const roi={left:b.left+(b.right-b.left)*.42,top:rw.top,width:b.right-(b.left+(b.right-b.left)*.42),height:rw.bottom-rw.top},ww=within(ex.words,roi.left,roi.left+roi.width,roi.top,roi.top+roi.height),s=text(ww),sm=statMatch(s,LEGAL_STAT_POOLS[slot.color]),tr=traitMatch(s),qt=tierMatch(s),sc=Math.min(conf(sm.score,ww),geometryConfidenceCap),tc=Math.min(conf(tr.score,ww),geometryConfidenceCap),qc=Math.min(qt.score,geometryConfidenceCap),finalConfidence=Math.min(sc,qc,tc);fc.push({path:`banners.${role}.emblems.${i}.stat`,confidence:sc},{path:`banners.${role}.emblems.${i}.qualityTier`,confidence:qc},{path:`banners.${role}.emblems.${i}.trait`,confidence:tc});if(finalConfidence<.9)warnings.push(`${role} emblem ${i+1} OCR should be reviewed.`);emblemDiagnostics.push({role,rowIndex:i,roi,synthesizedRow:rw.synthesized,words:ww.map(wordDiagnostic),inferredColor:slot.color,rawText:s,normalizedStat:sm.value,statMatchScore:sm.score,rawTierText:s,normalizedTier:qt.value,tierMatchScore:qt.score,rawTraitText:s,normalizedTrait:tr.value,traitMatchScore:tr.score,finalConfidence,reviewRequired:finalConfidence<REVIEW_THRESHOLD});return{position:slot.index,color:slot.color,stat:sm.value,qualityTier:qt.value,trait:tr.value};});banners[role]={selectedTeam:tm.team,emblems};}

  const actionRows=pooled.length?pooled:ROLES.flatMap(r=>rows[r]),actions=await parseActions(worker,img,ex,crop,actionRows,fc,warnings),tokens=tokenCount(ex.words);if(geometryConfidenceCap<1){for(const field of fc)if(field.path.startsWith('operationIds.'))field.confidence=Math.min(field.confidence,geometryConfidenceCap);}const result:RawScreenshotImport={layoutId,banners,operationIds:actions.ops,fieldConfidence:fc,warnings};if(tokens){result.tokensRemaining=tokens.value;fc.push({path:'tokensRemaining',confidence:tokens.confidence});}
  const tierCandidates:TierCandidateDiagnostic[]=ROLES.flatMap(role=>tierWords(ex.words,bs[role]).map(w=>({...wordDiagnostic(w),role,similarity:sim(w.text,'TIER')})));
  const diagnostic:ScreenshotGeometryDiagnostic={localizationWordCount:local.words.length,extractionWordCount:ex.words.length,roleCandidates:localGeometry.roleCandidates,cardAnchors:localGeometry.cardAnchors,columnLocalizationMethod:localGeometry.method,localizationColumnCenters:localGeometry.centers,localizationCrop,sourceCrop:crop,extractionColumnMethod:extractionGeometry.method,extractionColumnCenters:extractionGeometry.centers,columnBands:bs,tierCandidates,tierRowsByColumn:detected,globalRows:pooled,inferredLayout:layoutId,synthesizedRows,emblems:emblemDiagnostics,teamEvidence,actionEvidence:{resolved:actions.ops,reason:actions.reason,cardTexts:actions.cardTexts},tokenEvidence:{rawText:tokens?.rawText??'',value:tokens?.value??null,confidence:tokens?.confidence??0}};
  return{result,metrics:{sourceWidth:img.naturalWidth,sourceHeight:img.naturalHeight,localizationWidth:local.width,localizationHeight:local.height,extractionWidth:ex.width,extractionHeight:ex.height,localizationMs:local.elapsedMs,extractionMs:ex.elapsedMs,targetedRetryMs:actions.extraMs,totalMs:performance.now()-start,croppedPixelFraction:(crop.width*crop.height)/(img.naturalWidth*img.naturalHeight),processedPixels:{localization:local.width*local.height,extraction:ex.width*ex.height},diagnostic}};
}
