import type { BoardLayoutId, DataBundle, QualityTier, Role, StatName, TraitName } from '../domain/types.js';
import { BOARD_LAYOUTS } from '../domain/rules.js';
import { ACTION_CATALOG } from '../data/actionCatalog.js';
import type { RawScreenshotImport, ScreenshotFieldConfidence } from './screenshotImport.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const TRAITS: readonly TraitName[] = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const OCR_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';
const LOCALIZE_MAX_DIMENSION = 1100;
const EXTRACT_MAX_DIMENSION = 1800;

interface OcrWord { text:string; confidence:number; left:number; top:number; width:number; height:number; lineKey:string; }
interface OcrResult { words:OcrWord[]; elapsedMs:number; width:number; height:number; }
interface TesseractWorker {
  recognize(image: HTMLCanvasElement, options?: Record<string, unknown>, output?: Record<string, boolean>): Promise<{ data:{ text:string; tsv?:string } }>;
  terminate(): Promise<void>;
}
interface TesseractGlobal { createWorker(language?:string): Promise<TesseractWorker>; }
declare global { interface Window { Tesseract?: TesseractGlobal; } }

export interface LocalScreenshotOcrMetrics {
  sourceWidth:number;
  sourceHeight:number;
  localizationWidth:number;
  localizationHeight:number;
  extractionWidth:number;
  extractionHeight:number;
  localizationMs:number;
  extractionMs:number;
  totalMs:number;
  croppedPixelFraction:number;
}
export interface LocalScreenshotOcrOutput { result:RawScreenshotImport; metrics:LocalScreenshotOcrMetrics; }

const STAT_ALIASES: Record<StatName,string[]> = {
  'Creep Score':['CREEP SCORE','CREEP'], GPM:['GPM'], Deaths:['DEATHS'], 'Tower Kills':['TOWER KILLS','TOWER'], Madstone:['MADSTONE COLLECTED','MADSTONE'], Kills:['KILLS'],
  'Teamfight Participation':['TEAMFIGHT PARTICIPATION','TEAMFIGHT'], 'Tormentor Kills':['TORMENTOR KILLS','TORMENTOR'], 'Roshan Kills':['ROSHAN KILLS','ROSHAN'], Stuns:['STUNS'], 'Courier Kills':['COURIER KILLS','COURIER'], 'First Blood':['FIRST BLOOD'],
  Runes:['RUNES GRABBED','RUNES'], Watchers:['WATCHERS'], 'Wards Placed':['WARDS PLACED','WARDS'], 'Smokes Used':['SMOKES USED','SMOKES'], 'Camps Stacked':['CAMPS STACKED','CAMPS'], Lotuses:['LOTUSES'],
};

function norm(text:string):string { return text.toUpperCase().replace(/[^A-Z0-9]/g,''); }
function editDistance(a:string,b:string):number {
  const prev=Array.from({length:b.length+1},(_,i)=>i); const next=new Array<number>(b.length+1);
  for(let i=1;i<=a.length;i++){ next[0]=i; for(let j=1;j<=b.length;j++) next[j]=Math.min(next[j-1]!+1,prev[j]!+1,prev[j-1]!+(a[i-1]===b[j-1]?0:1)); for(let j=0;j<=b.length;j++) prev[j]=next[j]!; }
  return prev[b.length]!;
}
function similarity(a:string,b:string):number { const aa=norm(a),bb=norm(b); if(!aa||!bb)return 0; if(aa.includes(bb)||bb.includes(aa)) return Math.min(aa.length,bb.length)/Math.max(aa.length,bb.length); return 1-editDistance(aa,bb)/Math.max(aa.length,bb.length); }
function bestAlias(text:string, aliases:readonly string[]):number { return Math.max(...aliases.map(alias=>similarity(text,alias))); }
function lineGroups(words:readonly OcrWord[]): Map<string,OcrWord[]> { const map=new Map<string,OcrWord[]>(); for(const w of words){const row=map.get(w.lineKey)??[];row.push(w);map.set(w.lineKey,row);} return map; }
function lineText(words:readonly OcrWord[]):string { return [...words].sort((a,b)=>a.left-b.left).map(w=>w.text).join(' '); }
function centerX(word:OcrWord):number { return word.left+word.width/2; }
function centerY(word:OcrWord):number { return word.top+word.height/2; }
function isAnchor(word:OcrWord, label:string):boolean { return similarity(word.text,label)>=0.72; }

async function ensureTesseract():Promise<TesseractGlobal> {
  if(window.Tesseract) return window.Tesseract;
  await new Promise<void>((resolve,reject)=>{ const existing=document.querySelector<HTMLScriptElement>('script[data-local-ocr="tesseract"]'); if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Local OCR failed to load.')),{once:true});return;} const script=document.createElement('script');script.src=OCR_CDN;script.async=true;script.dataset.localOcr='tesseract';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Local OCR failed to load.'));document.head.appendChild(script); });
  if(!window.Tesseract) throw new Error('Local OCR runtime is unavailable.');
  return window.Tesseract;
}

async function imageFromFile(file:File):Promise<HTMLImageElement> {
  if(!file.type.startsWith('image/')) throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');
  return await new Promise((resolve,reject)=>{ const image=new Image(); const url=URL.createObjectURL(file); image.onload=()=>{URL.revokeObjectURL(url);resolve(image);}; image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('The selected screenshot could not be decoded.'));}; image.src=url; });
}
function canvasFromImage(image:HTMLImageElement, maxDimension:number, crop?:{left:number;top:number;width:number;height:number}):HTMLCanvasElement {
  const source=crop??{left:0,top:0,width:image.naturalWidth,height:image.naturalHeight};
  const scale=Math.min(1,maxDimension/Math.max(source.width,source.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas image processing is unavailable in this browser.');
  ctx.drawImage(image,source.left,source.top,source.width,source.height,0,0,canvas.width,canvas.height);return canvas;
}
function parseTsv(tsv:string|undefined):OcrWord[] {
  if(!tsv)return[]; const words:OcrWord[]=[]; for(const row of tsv.split(/\r?\n/).slice(1)){ const cols=row.split('\t'); if(cols.length<12||cols[0]!=='5')continue; const text=cols.slice(11).join('\t').trim(); if(!text)continue; words.push({text,confidence:Number(cols[10])||0,left:Number(cols[6])||0,top:Number(cols[7])||0,width:Number(cols[8])||0,height:Number(cols[9])||0,lineKey:`${cols[1]}:${cols[2]}:${cols[3]}:${cols[4]}`}); } return words;
}
async function recognize(worker:TesseractWorker, canvas:HTMLCanvasElement):Promise<OcrResult> { const t0=performance.now(); const {data}=await worker.recognize(canvas,{}, {tsv:true}); return {words:parseTsv(data.tsv),elapsedMs:performance.now()-t0,width:canvas.width,height:canvas.height}; }

function roleCenters(words:readonly OcrWord[], width:number):Record<Role,number> {
  const found={} as Partial<Record<Role,number>>;
  for(const role of ROLES){ const label=role.toUpperCase(); const candidates=words.filter(w=>isAnchor(w,label)); if(candidates.length) found[role]=centerX(candidates.sort((a,b)=>b.confidence-a.confidence)[0]!); }
  if(Object.keys(found).length===3) return found as Record<Role,number>;
  return {core:width/6,mid:width/2,support:width*5/6};
}
function estimateCrop(local:OcrResult, sourceWidth:number, sourceHeight:number):{left:number;top:number;width:number;height:number} {
  const centers=roleCenters(local.words,local.width); const spacing=Math.min(centers.mid-centers.core,centers.support-centers.mid); const left=Math.max(0,centers.core-spacing*0.58); const right=Math.min(local.width,centers.support+spacing*0.58);
  const headings=local.words.filter(w=>ROLES.some(r=>isAnchor(w,r.toUpperCase()))); const topLocal=headings.length?Math.max(0,Math.min(...headings.map(w=>w.top))-Math.max(20,local.height*0.05)):0;
  const scaleX=sourceWidth/local.width,scaleY=sourceHeight/local.height;
  return {left:Math.floor(left*scaleX),top:Math.floor(topLocal*scaleY),width:Math.ceil((right-left)*scaleX),height:Math.ceil(sourceHeight-topLocal*scaleY)};
}
function roleBands(words:readonly OcrWord[], width:number):Record<Role,{left:number;right:number}> { const c=roleCenters(words,width); const a=(c.core+c.mid)/2,b=(c.mid+c.support)/2; return {core:{left:0,right:a},mid:{left:a,right:b},support:{left:b,right:width}}; }
function tierRows(words:readonly OcrWord[], band:{left:number;right:number}):number[] {
  const ys=words.filter(w=>centerX(w)>=band.left&&centerX(w)<band.right&&similarity(w.text,'TIER')>=0.65).map(centerY).sort((a,b)=>a-b); const grouped:number[]=[];
  for(const y of ys){if(!grouped.length||Math.abs(y-grouped[grouped.length-1]!)>14)grouped.push(y);else grouped[grouped.length-1]=(grouped[grouped.length-1]!+y)/2;} return grouped;
}
function inferLayout(rows:Record<Role,number[]>):BoardLayoutId {
  const counts=ROLES.map(r=>rows[r].length); if(counts.filter(c=>c>=5).length>=2)return'expanded_5'; if(counts.filter(c=>c>=3).length>=2)return'legacy_3'; return Math.max(...counts)>=5?'expanded_5':'legacy_3';
}
function rowBounds(rows:number[], index:number, top:number, bottom:number):{top:number;bottom:number} { const y=rows[index]??(top+(index+.5)*(bottom-top)/Math.max(rows.length,1)); const prev=index===0?top:(rows[index-1]!+y)/2; const next=index===rows.length-1?bottom:(y+rows[index+1]!)/2; return {top:prev,bottom:next}; }
function wordsIn(words:readonly OcrWord[], left:number,right:number,top:number,bottom:number):OcrWord[] { return words.filter(w=>centerX(w)>=left&&centerX(w)<right&&centerY(w)>=top&&centerY(w)<bottom); }
function matchStat(text:string, legal:readonly StatName[]):{value:StatName;score:number} { let best={value:legal[0]!,score:-1}; for(const stat of legal){const score=bestAlias(text,STAT_ALIASES[stat]);if(score>best.score)best={value:stat,score};} return best; }
function matchTrait(text:string):{value:TraitName;score:number} { let best={value:TRAITS[0]!,score:-1}; for(const trait of TRAITS){const score=similarity(text,trait);if(score>best.score)best={value:trait,score};} return best; }
function parseTier(text:string):{value:QualityTier;score:number} { const cleaned=text.toUpperCase().replace(/[^IV\s]/g,' '); const matches=cleaned.match(/\b(?:III|IV|II|V|I)\b/g)??[]; const roman=matches.find(x=>x!=='I')??matches[0]; const map:Record<string,QualityTier>={I:1,II:2,III:3,IV:4,V:5}; return roman&&map[roman]?{value:map[roman]!,score:.96}:{value:1,score:.25}; }
function confidence(score:number, ocrWords:readonly OcrWord[]):number { const ocr=ocrWords.length?Math.max(0,Math.min(1,ocrWords.reduce((s,w)=>s+w.confidence,0)/ocrWords.length/100)):0; return Math.max(0,Math.min(.99,score*.72+ocr*.28)); }
function matchTeam(words:readonly OcrWord[], role:Role, data:DataBundle):{team:string;score:number} {
  const text=lineText(words); let best={team:data.players.find(p=>p.role===role)?.team??'',score:-1};
  for(const profile of data.players.filter(p=>p.role===role)){ const names=[profile.name,...profile.attachedPlayers]; const scores=names.map(name=>similarity(text,name)); const strong=scores.filter(s=>s>.62); const score=strong.length?Math.min(.99,strong.reduce((a,b)=>a+b,0)/Math.min(2,strong.length)):Math.max(...scores,0); if(score>best.score)best={team:profile.team,score}; }
  return best;
}
function actionMatches(text:string):Array<{id:string;score:number}> { return ACTION_CATALOG.map(a=>({id:a.id,score:similarity(text,a.label)})).sort((a,b)=>b.score-a.score); }

export async function parseScreenshotLocally(file:File, data:DataBundle):Promise<LocalScreenshotOcrOutput> {
  const started=performance.now(); const image=await imageFromFile(file); const tesseract=await ensureTesseract(); const worker=await tesseract.createWorker('eng');
  try {
    const localCanvas=canvasFromImage(image,LOCALIZE_MAX_DIMENSION); const local=await recognize(worker,localCanvas); const crop=estimateCrop(local,image.naturalWidth,image.naturalHeight); const extractCanvas=canvasFromImage(image,EXTRACT_MAX_DIMENSION,crop); const extracted=await recognize(worker,extractCanvas);
    const bands=roleBands(extracted.words,extracted.width); const rows=Object.fromEntries(ROLES.map(r=>[r,tierRows(extracted.words,bands[r])])) as Record<Role,number[]>; const layoutId=inferLayout(rows); const layout=BOARD_LAYOUTS[layoutId];
    const fieldConfidence:ScreenshotFieldConfidence[]=[]; const warnings:string[]=[]; const banners={} as RawScreenshotImport['banners'];
    for(const role of ROLES){ const band=bands[role]; const expected=layout.roles[role]; const roleRows=rows[role]; const firstY=roleRows[0]??extracted.height*.18; const teamWords=wordsIn(extracted.words,band.left,band.left+(band.right-band.left)*.56,0,Math.max(firstY-8,extracted.height*.22)); const team=matchTeam(teamWords,role,data); fieldConfidence.push({path:`banners.${role}.selectedTeam`,confidence:team.score}); if(team.score<.9)warnings.push(`${role} team OCR should be reviewed.`);
      const emblems=expected.map((slot,index)=>{ const bounds=rowBounds(roleRows,index,index===0?extracted.height*.05:(roleRows[0]??0)-40,index===roleRows.length-1?Math.min(extracted.height,(roleRows.at(-1)??extracted.height)+70):extracted.height); const rightStart=band.left+(band.right-band.left)*.48; const rowWords=wordsIn(extracted.words,rightStart,band.right,bounds.top,bounds.bottom); const text=lineText(rowWords); const stat=matchStat(text,layout.statPools[slot.color]); const trait=matchTrait(text); const tier=parseTier(text); const statConf=confidence(stat.score,rowWords),traitConf=confidence(trait.score,rowWords),tierConf=tier.score;
        fieldConfidence.push({path:`banners.${role}.emblems.${index}.stat`,confidence:statConf},{path:`banners.${role}.emblems.${index}.qualityTier`,confidence:tierConf},{path:`banners.${role}.emblems.${index}.trait`,confidence:traitConf}); if(Math.min(statConf,tierConf,traitConf)<.9)warnings.push(`${role} emblem ${index+1} OCR should be reviewed.`); return {position:slot.index,color:slot.color,stat:stat.value,qualityTier:tier.value,trait:trait.value}; });
      banners[role]={selectedTeam:team.team,emblems};
    }
    const lastTier=Math.max(...ROLES.flatMap(r=>rows[r]),0); const menuWords=extracted.words.filter(w=>centerY(w)>lastTier+25); const menuLines=[...lineGroups(menuWords).values()].map(lineText).filter(Boolean); const operations:[string|null,string|null,string|null]=[null,null,null]; const used=new Set<string>(); let opIndex=0;
    for(const text of menuLines){ if(opIndex>=3)break; const match=actionMatches(text)[0]; if(match&&match.score>=.62&&!used.has(match.id)){operations[opIndex]=match.id;used.add(match.id);fieldConfidence.push({path:`operationIds.${opIndex}`,confidence:match.score});opIndex++;} }
    while(opIndex<3){fieldConfidence.push({path:`operationIds.${opIndex}`,confidence:0});warnings.push(`Action ${opIndex+1} is missing or unreadable.`);opIndex++;}
    const result:RawScreenshotImport={layoutId,banners,operationIds:operations,fieldConfidence,warnings};
    return {result,metrics:{sourceWidth:image.naturalWidth,sourceHeight:image.naturalHeight,localizationWidth:local.width,localizationHeight:local.height,extractionWidth:extracted.width,extractionHeight:extracted.height,localizationMs:local.elapsedMs,extractionMs:extracted.elapsedMs,totalMs:performance.now()-started,croppedPixelFraction:(crop.width*crop.height)/(image.naturalWidth*image.naturalHeight)}};
  } finally { await worker.terminate(); }
}
