import type { DataBundle, Role, SlotColor, StatName } from '../domain/types.js';
import { BOARD_LAYOUTS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import type { RawScreenshotImport, ScreenshotFieldConfidence } from './screenshotImport.js';

const ROLES:readonly Role[]=['core','mid','support'];
const ALIASES:Record<StatName,string[]>={'Creep Score':['CREEP SCORE','CREEP'],GPM:['GPM'],Deaths:['DEATHS'],'Tower Kills':['TOWER KILLS','TOWER'],Madstone:['MADSTONE COLLECTED','MADSTONE'],Kills:['KILLS'],'Teamfight Participation':['TEAMFIGHT PARTICIPATION','TEAMFIGHT'],'Tormentor Kills':['TORMENTOR KILLS','TORMENTOR'],'Roshan Kills':['ROSHAN KILLS','ROSHAN'],Stuns:['STUNS'],'Courier Kills':['COURIER KILLS','COURIER'],'First Blood':['FIRST BLOOD'],Runes:['RUNES GRABBED','RUNES'],Watchers:['WATCHERS'],'Wards Placed':['OBS WARDS PLANTED','WARDS PLACED','WARDS'],'Smokes Used':['SMOKES USED','SMOKES'],'Camps Stacked':['CAMPS STACKED','CAMPS'],Lotuses:['LOTUSES GAINED','LOTUSES']};
interface Word{text:string;confidence:number;left:number;top:number;width:number;height:number;}
interface Worker{recognize(image:HTMLCanvasElement,options?:Record<string,unknown>,output?:Record<string,boolean>):Promise<{data:{tsv?:string}}>;}
interface Tess{createWorker(language?:string):Promise<Worker>;}
let workerPromise:Promise<Worker>|undefined;
const norm=(s:string)=>s.toUpperCase().replace(/[^A-Z0-9]/g,'');
function distance(a:string,b:string):number{const p=Array.from({length:b.length+1},(_,i)=>i),n=new Array<number>(b.length+1);for(let i=1;i<=a.length;i++){n[0]=i;for(let j=1;j<=b.length;j++)n[j]=Math.min(n[j-1]!+1,p[j]!+1,p[j-1]!+(a[i-1]===b[j-1]?0:1));for(let j=0;j<=b.length;j++)p[j]=n[j]!;}return p[b.length]!;}
function sim(a:string,b:string):number{const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x.includes(y)||y.includes(x))return Math.min(x.length,y.length)/Math.max(x.length,y.length);return 1-distance(x,y)/Math.max(x.length,y.length);}
function parse(tsv?:string):Word[]{if(!tsv)return[];const out:Word[]=[];for(const row of tsv.split(/\r?\n/).slice(1)){const c=row.split('\t');if(c.length<12||c[0]!=='5')continue;const text=c.slice(11).join('\t').trim();if(text)out.push({text,confidence:Number(c[10])||0,left:Number(c[6])||0,top:Number(c[7])||0,width:Number(c[8])||0,height:Number(c[9])||0});}return out;}
const cx=(w:Word)=>w.left+w.width/2,cy=(w:Word)=>w.top+w.height/2;
async function worker():Promise<Worker>{workerPromise??=(async()=>{const T=(window as unknown as {Tesseract?:Tess}).Tesseract;if(!T)throw new Error('Local OCR runtime is unavailable for emblem refinement.');return await T.createWorker('eng');})();return workerPromise;}
async function image(file:File):Promise<HTMLImageElement>{return await new Promise((ok,no)=>{const i=new Image(),u=URL.createObjectURL(file);i.onload=()=>{URL.revokeObjectURL(u);ok(i);};i.onerror=()=>{URL.revokeObjectURL(u);no(new Error('Could not decode screenshot for emblem refinement.'));};i.src=u;});}
function canvas(i:HTMLImageElement,left=0,top=0,width=i.naturalWidth,height=i.naturalHeight):HTMLCanvasElement{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(width));c.height=Math.max(1,Math.round(height));const x=c.getContext('2d');if(!x)throw new Error('Canvas unavailable.');x.drawImage(i,left,top,width,height,0,0,c.width,c.height);return c;}
function cluster(values:number[],tol:number):number[]{const s=[...values].sort((a,b)=>a-b),out:number[]=[];for(const v of s){if(!out.length||v-out.at(-1)!>tol)out.push(v);else out[out.length-1]=(out.at(-1)!+v)/2;}return out;}
function statMatch(s:string,legal:readonly StatName[]){let best={value:legal[0]!,score:-1};for(const v of legal){const score=Math.max(...ALIASES[v].map(a=>sim(s,a)));if(score>best.score)best={value:v,score};}return best;}
function confidenceFor(raw:RawScreenshotImport,path:string):number{return raw.fieldConfidence?.find(x=>x.path===path)?.confidence??0;}
function setConfidence(raw:RawScreenshotImport,path:string,confidence:number):void{raw.fieldConfidence??=[];const old=raw.fieldConfidence.find(x=>x.path===path);if(old)old.confidence=Math.max(old.confidence,confidence);else raw.fieldConfidence.push({path,confidence} satisfies ScreenshotFieldConfidence);}

/** Retry only uncertain stat titles using tiny source-resolution emblem-title crops. */
export async function refineUncertainEmblemStats(file:File,data:DataBundle,raw:RawScreenshotImport):Promise<RawScreenshotImport>{
 void data;
 const layout=BOARD_LAYOUTS[raw.layoutId],targets:Array<{role:Role;index:number;color:SlotColor;path:string}>=[];
 for(const role of ROLES)for(let i=0;i<layout.roles[role].length;i++){const path=`banners.${role}.emblems.${i}.stat`;if(confidenceFor(raw,path)<.9)targets.push({role,index:i,color:layout.roles[role][i]!.color,path});}
 if(!targets.length)return raw;
 const src=await image(file),w=await worker(),whole=await w.recognize(canvas(src),{}, {tsv:true}),words=parse(whole.data.tsv);
 const tierWords=words.filter(x=>sim(x.text,'TIER')>=.62),xs=cluster(tierWords.map(cx),Math.max(20,src.naturalWidth*.035));
 if(xs.length<3)return raw;
 // The left edge of each emblem card is anchored by its TIER label. Three TIER x-clusters
 // are substantially more stable than arbitrary screenshot bounds or player-art geometry.
 const centers=xs.slice(-3).sort((a,b)=>a-b),roleCenter:Record<Role,number>={core:centers[0]!,mid:centers[1]!,support:centers[2]!};
 const allRows=cluster(tierWords.map(cy),Math.max(9,src.naturalHeight*.012));
 const expected=raw.layoutId==='expanded_5'?5:3;
 if(allRows.length<expected)return raw;
 const rows=allRows.slice(0,expected);
 const spacing=centers.length===3?Math.min(centers[1]!-centers[0]!,centers[2]!-centers[1]!):src.naturalWidth/3;
 const pitch=rows.length>1?rows.slice(1).reduce((s,y,i)=>s+y-rows[i]!,0)/(rows.length-1):src.naturalHeight*.1;
 for(const t of targets){
   const x=roleCenter[t.role],y=rows[t.index];if(x===undefined||y===undefined)continue;
   // Live screenshots show TIER near the card's left edge; the stat title is above it and
   // extends to the right. Crop that title band from native source pixels without upscaling.
   const left=Math.max(0,x-spacing*.035),top=Math.max(0,y-pitch*.43),right=Math.min(src.naturalWidth,x+spacing*.37),bottom=Math.min(src.naturalHeight,y-pitch*.06);
   if(right-left<20||bottom-top<12)continue;
   const r=await w.recognize(canvas(src,left,top,right-left,bottom-top),{tessedit_pageseg_mode:'6'},{tsv:true}),rw=parse(r.data.tsv),s=rw.sort((a,b)=>a.top-b.top||a.left-b.left).map(x=>x.text).join(' ');
   const match=statMatch(s,LEGAL_STAT_POOLS[t.color]);
   const ocr=rw.length?rw.reduce((sum,x)=>sum+x.confidence,0)/rw.length/100:0,confidence=Math.max(0,Math.min(.99,match.score*.8+ocr*.2));
   if(match.score>=.58&&confidence>confidenceFor(raw,t.path)){raw.banners[t.role].emblems[t.index]!.stat=match.value;setConfidence(raw,t.path,confidence);}
 }
 return raw;
}
