import type { BannerEmblems, BoardLayoutId, BoardState, DataBundle, EmblemState, MenuState, QualityTier, Role, SlotColor, StatName, TraitName } from '../domain/types.js';
import { BOARD_LAYOUTS, isLegalStat } from '../domain/rules.js';
import { ACTION_BY_ID, ACTION_CATALOG, cloneAction } from '../data/actionCatalog.js';
import { matchActionText, ocrSimilarity } from './ocrDomainMatch.js';
import { parseScreenshotLocally, type LocalScreenshotOcrMetrics } from './localScreenshotOcr.js';
import { refineUncertainScreenshotFields } from './emblemOcrRefinement.js';

const ROLES: readonly Role[] = ['core', 'mid', 'support'];
const TRAITS: readonly TraitName[] = ['Fractal', 'Friendly', 'Vampiric', 'Unique', 'Benevolent'];
const REVIEW_THRESHOLD = .9;
const clamp = (value:number):number => Math.max(0, Math.min(1, value));
const normalized = (value:string):string => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

export type ScreenshotEvidenceClass =
  | 'exact-domain-stat'
  | 'targeted-native-stat'
  | 'fuzzy-stat'
  | 'direct-native-tier'
  | 'targeted-native-tier'
  | 'fuzzy-tier'
  | 'exact-domain-trait'
  | 'targeted-native-trait'
  | 'fuzzy-trait'
  | 'roster-team'
  | 'fuzzy-team'
  | 'dedicated-action-crop'
  | 'fuzzy-action'
  | 'direct-token'
  | 'fuzzy-token'
  | 'geometry-fallback'
  | 'synthesized-row'
  | 'conflicting-retry'
  | 'unresolved'
  | 'raw-ocr';

export interface ScreenshotConfidenceComponents {
  geometry:number;
  domainMatch:number;
  structuredEvidence:number;
  targetedRetry:number;
  fieldConsistency:number;
}
export interface ScreenshotFieldConfidence {
  path:string;
  confidence:number;
  reason?:ScreenshotEvidenceClass;
  components?:ScreenshotConfidenceComponents|undefined;
}
export interface ScreenshotConfidenceEvidence {
  resolved:boolean;
  rawConfidence:number;
  reason:ScreenshotEvidenceClass;
  components:ScreenshotConfidenceComponents;
}
export interface RawScreenshotEmblem { position:number;color:SlotColor;stat:StatName;qualityTier:QualityTier;trait:TraitName; }
export interface RawScreenshotBanner { selectedTeam:string;emblems:RawScreenshotEmblem[]; }
export interface RawScreenshotImport { layoutId:BoardLayoutId;banners:Record<Role,RawScreenshotBanner>;operationIds:[string|null,string|null,string|null];tokensRemaining?:number;fieldConfidence?:ScreenshotFieldConfidence[];warnings?:string[]; }
export interface ScreenshotImportRequest { imageDataUrl:string;teamsByRole:Record<Role,string[]>;actions:Array<{id:string;label:string}>; }
export interface ValidatedScreenshotImport { board:BoardState;menu:MenuState;tokensRemaining?:number;warnings:string[];lowConfidenceFields:ScreenshotFieldConfidence[];requiresReview:boolean; }

let lastLocalOcrMetrics:LocalScreenshotOcrMetrics|undefined;
export function getLastLocalOcrMetrics():LocalScreenshotOcrMetrics|undefined { return lastLocalOcrMetrics; }

export function calibrateConfidenceEvidence(path:string, evidence:ScreenshotConfidenceEvidence):ScreenshotFieldConfidence {
  const components:ScreenshotConfidenceComponents = {
    geometry:clamp(evidence.components.geometry),
    domainMatch:clamp(evidence.components.domainMatch),
    structuredEvidence:clamp(evidence.components.structuredEvidence),
    targetedRetry:clamp(evidence.components.targetedRetry),
    fieldConsistency:clamp(evidence.components.fieldConsistency),
  };
  if (!evidence.resolved) return { path, confidence:0, reason:'unresolved', components };
  const structured = Math.max(components.structuredEvidence, components.targetedRetry);
  const fuzzyBlend = clamp(components.domainMatch * .75 + clamp(evidence.rawConfidence) * .25);
  const evidenceStrength = structured >= .95 ? structured : Math.min(.89, Math.max(structured, fuzzyBlend));
  const consistencyCap = components.fieldConsistency < .75 ? .84 : 1;
  return {
    path,
    confidence:clamp(Math.min(components.geometry, consistencyCap, evidenceStrength)),
    reason:components.fieldConsistency < .75 ? 'conflicting-retry' : evidence.reason,
    components,
  };
}

function assertRecord(v:unknown,label:string):asserts v is Record<string,unknown> { if(!v||typeof v!=='object'||Array.isArray(v)) throw new Error(`${label} is missing or invalid.`); }
function asLayoutId(v:unknown):BoardLayoutId { if(v!=='legacy_3'&&v!=='expanded_5') throw new Error('Screenshot parser returned an unsupported board layout.'); return v; }
function asTeam(v:unknown,role:Role,data:DataBundle):string { if(typeof v!=='string') throw new Error(`Screenshot parser did not return a ${role} team.`); const legal=new Set(data.players.filter(p=>p.role===role).map(p=>p.team)); if(!legal.has(v)) throw new Error(`Screenshot parser returned unknown ${role} team: ${v}.`); return v; }
function asTier(v:unknown,path:string):QualityTier { if(!Number.isInteger(v)||Number(v)<1||Number(v)>5) throw new Error(`${path} has an invalid quality tier.`); return Number(v) as QualityTier; }
function asTrait(v:unknown,path:string):TraitName { if(typeof v!=='string'||!TRAITS.includes(v as TraitName)) throw new Error(`${path} has an invalid trait.`); return v as TraitName; }
function confidenceComponents(v:unknown):ScreenshotConfidenceComponents|undefined {
  if(!v||typeof v!=='object'||Array.isArray(v)) return undefined;
  const row=v as Partial<Record<keyof ScreenshotConfidenceComponents,unknown>>;
  const keys:(keyof ScreenshotConfidenceComponents)[]=['geometry','domainMatch','structuredEvidence','targetedRetry','fieldConsistency'];
  if(!keys.every(key=>typeof row[key]==='number'&&Number.isFinite(row[key]))) return undefined;
  return {
    geometry:clamp(row.geometry as number),
    domainMatch:clamp(row.domainMatch as number),
    structuredEvidence:clamp(row.structuredEvidence as number),
    targetedRetry:clamp(row.targetedRetry as number),
    fieldConsistency:clamp(row.fieldConsistency as number),
  };
}
function confidences(v:unknown):ScreenshotFieldConfidence[] {
  if(!Array.isArray(v)) return [];
  const out:ScreenshotFieldConfidence[]=[];
  for(const row of v){
    if(!row||typeof row!=='object') continue;
    const c=row as {path?:unknown;confidence?:unknown;reason?:unknown;components?:unknown};
    if(typeof c.path!=='string'||typeof c.confidence!=='number'||!Number.isFinite(c.confidence)) continue;
    const parsed:ScreenshotFieldConfidence={path:c.path,confidence:clamp(c.confidence)};
    if(typeof c.reason==='string') parsed.reason=c.reason as ScreenshotEvidenceClass;
    const components=confidenceComponents(c.components); if(components) parsed.components=components;
    out.push(parsed);
  }
  return out;
}
function confidenceFor(raw:RawScreenshotImport,path:string):number { return raw.fieldConfidence?.find(field=>field.path===path)?.confidence??0; }
function averageDiagnosticWordConfidence(words:readonly {confidence:number}[]):number { return words.length?clamp(words.reduce((sum,word)=>sum+word.confidence,0)/words.length/100):0; }
export function directTierText(text:string,tier:QualityTier):boolean {
  const upper=text.toUpperCase().replace(/[“”'`]/g,'');
  const roman:Record<QualityTier,string>={1:'I',2:'II',3:'III',4:'IV',5:'V'};
  return new RegExp(`TIER[^A-Z0-9]{0,8}${roman[tier]}(?:[^IV]|$)`,'i').test(upper);
}
function geometryConfidence(metrics:LocalScreenshotOcrMetrics):{value:number;reason?:ScreenshotEvidenceClass} {
  const directTierRowCount=Object.values(metrics.diagnostic.tierRowsByColumn).reduce((sum,rows)=>sum+rows.length,0);
  if(directTierRowCount===0) return {value:.84,reason:'geometry-fallback'};
  if(metrics.diagnostic.extractionColumnMethod==='fallback') return {value:.85,reason:'geometry-fallback'};
  return {value:1};
}
function baseComponents(geometry:number,domainMatch:number):ScreenshotConfidenceComponents {
  return {geometry,domainMatch:clamp(domainMatch),structuredEvidence:0,targetedRetry:0,fieldConsistency:1};
}
function phraseSimilarity(rawText:string,target:string):number {
  const rawTokens=rawText.toUpperCase().match(/[A-Z0-9]+/g)??[];
  const targetWords=Math.max(1,target.trim().split(/\s+/).length);
  let best=ocrSimilarity(rawText,target);
  for(let words=Math.max(1,targetWords-1);words<=Math.min(rawTokens.length,targetWords+1);words++){
    for(let index=0;index+words<=rawTokens.length;index++) best=Math.max(best,ocrSimilarity(rawTokens.slice(index,index+words).join(' '),target));
  }
  return best;
}
interface TeamEvidenceMatch { team:string;score:number;runnerUpScore:number;margin:number;strongPlayerCount:number;bestPlayerScore:number;directTeamScore:number; }
function matchTeamEvidence(rawText:string,role:Role,data:DataBundle):TeamEvidenceMatch|undefined {
  if(!rawText.trim()) return undefined;
  const byTeam=new Map<string,{direct:number;players:Map<string,number>}>();
  for(const profile of data.players.filter(player=>player.role===role)){
    const current=byTeam.get(profile.team)??{direct:phraseSimilarity(rawText,profile.team),players:new Map<string,number>()};
    for(const name of profile.attachedPlayers.filter(playerName=>normalized(playerName).length>=4)){
      const score=phraseSimilarity(rawText,name);
      current.players.set(name,Math.max(score,current.players.get(name)??0));
    }
    current.direct=Math.max(current.direct,phraseSimilarity(rawText,profile.team));
    byTeam.set(profile.team,current);
  }
  const ranked=[...byTeam.entries()].map(([team,evidence])=>{
    const playerScores=[...evidence.players.values()].sort((a,b)=>b-a),bestPlayerScore=playerScores[0]??0,strongPlayerCount=playerScores.filter(score=>score>=.82).length;
    const pairScore=((playerScores[0]??0)+(playerScores[1]??0))/2;
    const singleAnchor=bestPlayerScore>=.94?bestPlayerScore*.98:0;
    const rosterScore=role==='mid'?bestPlayerScore:Math.max(pairScore,singleAnchor);
    return {team,score:Math.max(evidence.direct,rosterScore),strongPlayerCount,bestPlayerScore,directTeamScore:evidence.direct};
  }).sort((a,b)=>b.score-a.score);
  const best=ranked[0]; if(!best)return undefined;
  const runnerUpScore=ranked[1]?.score??0;
  return {...best,runnerUpScore,margin:best.score-runnerUpScore};
}
function trustedTeamEvidence(match:TeamEvidenceMatch,role:Role):boolean {
  const direct=match.directTeamScore>=.9&&match.margin>=.1;
  const singlePlayer=match.bestPlayerScore>=.82&&match.score>=.82&&match.margin>=.18;
  const roster=role==='mid'
    ? match.bestPlayerScore>=.9&&match.score>=.9&&match.margin>=.1
    : match.strongPlayerCount>=2&&match.score>=.84&&match.margin>=.08;
  return direct||singlePlayer||roster;
}

/** Re-score already-recognized fields from field-specific evidence. Strong evidence may also repair a team winner. */
export function calibrateScreenshotImportConfidence(raw:RawScreenshotImport, metrics:LocalScreenshotOcrMetrics, data:DataBundle):void {
  const geometry=geometryConfidence(metrics);
  const calibrated:ScreenshotFieldConfidence[]=[];
  const byEmblem=new Map(metrics.diagnostic.emblems.map(emblem=>[`${emblem.role}:${emblem.rowIndex}`,emblem] as const));
  const layout=BOARD_LAYOUTS[raw.layoutId];
  for(const role of ROLES){
    const teamPath=`banners.${role}.selectedTeam`,team=metrics.diagnostic.teamEvidence[role],teamRaw=confidenceFor(raw,teamPath),teamCorpus=[team.rawText,...metrics.diagnostic.emblems.filter(emblem=>emblem.role===role&&emblem.rowIndex===0).map(emblem=>emblem.rawText)].filter(Boolean).join(' '),teamMatch=matchTeamEvidence(teamCorpus,role,data);
    const teamDomain=teamMatch?.score??team.matchScore,teamComponents=baseComponents(geometry.value,teamDomain);
    let teamReason:ScreenshotEvidenceClass='fuzzy-team',teamResolved=Boolean(raw.banners[role].selectedTeam);
    if(teamMatch&&trustedTeamEvidence(teamMatch,role)){
      if(teamMatch.team!==raw.banners[role].selectedTeam){
        raw.banners[role].selectedTeam=teamMatch.team;
        team.normalizedTeam=teamMatch.team;
        team.matchScore=teamMatch.score;
      }
      teamComponents.structuredEvidence=.96;
      teamReason='roster-team';
      teamResolved=true;
    } else if(teamMatch&&teamMatch.team!==raw.banners[role].selectedTeam){
      teamComponents.fieldConsistency=.7;
      teamReason='conflicting-retry';
    }
    if(geometry.reason) teamReason=geometry.reason;
    calibrated.push(calibrateConfidenceEvidence(teamPath,{resolved:teamResolved,rawConfidence:teamRaw,reason:teamReason,components:teamComponents}));

    for(let index=0;index<layout.roles[role].length;index++){
      const emblem=raw.banners[role].emblems[index]!,diag=byEmblem.get(`${role}:${index}`),slot=layout.roles[role][index]!;
      if(!diag) continue;
      const statPath=`banners.${role}.emblems.${index}.stat`,statRaw=confidenceFor(raw,statPath),statComponents=baseComponents(geometry.value,diag.statMatchScore),initialStat=Math.min(geometry.value,clamp(diag.statMatchScore*.72+averageDiagnosticWordConfidence(diag.words)*.28));
      const statChanged=diag.normalizedStat!==emblem.stat,statStrengthened=statRaw>initialStat+.03;
      let statReason:ScreenshotEvidenceClass='fuzzy-stat';
      if(!isLegalStat(slot.color,emblem.stat)){statComponents.fieldConsistency=0;statReason='unresolved';}
      else if(!statChanged&&diag.statMatchScore>=.99){statComponents.structuredEvidence=.97;statReason='exact-domain-stat';}
      else if(statRaw>=.9&&(statChanged||statStrengthened)){statComponents.targetedRetry=.95;statComponents.fieldConsistency=statChanged?.9:1;statReason='targeted-native-stat';}
      else if(statChanged){statComponents.targetedRetry=statRaw;statComponents.fieldConsistency=.7;statReason='conflicting-retry';}
      if(geometry.reason) statReason=geometry.reason;
      calibrated.push(calibrateConfidenceEvidence(statPath,{resolved:isLegalStat(slot.color,emblem.stat),rawConfidence:statRaw,reason:statReason,components:statComponents}));

      const tierPath=`banners.${role}.emblems.${index}.qualityTier`,tierRaw=confidenceFor(raw,tierPath),tierComponents=baseComponents(geometry.value,diag.tierMatchScore),tierSame=diag.normalizedTier===emblem.qualityTier;
      let tierReason:ScreenshotEvidenceClass='fuzzy-tier';
      const tierDirect=tierSame&&directTierText(diag.rawTierText,emblem.qualityTier);
      if(tierDirect){
        const corroborated=diag.tierMatchScore>=.95||tierRaw>=.98;
        const unambiguousNonTierOne=emblem.qualityTier!==1&&diag.tierMatchScore>=.84;
        if(corroborated||unambiguousNonTierOne) tierComponents.structuredEvidence=corroborated?.98:.96;
        else tierComponents.structuredEvidence=.89;
        tierReason='direct-native-tier';
      } else if(tierSame&&diag.tierMatchScore>=.95){
        tierComponents.targetedRetry=.97;
        tierReason='targeted-native-tier';
      } else if(!tierSame){tierComponents.fieldConsistency=.7;tierReason='conflicting-retry';}
      if(geometry.reason) tierReason=geometry.reason;
      calibrated.push(calibrateConfidenceEvidence(tierPath,{resolved:tierDirect||tierRaw>.2,rawConfidence:tierRaw,reason:(tierDirect||tierRaw>.2)?tierReason:'unresolved',components:tierComponents}));

      const traitPath=`banners.${role}.emblems.${index}.trait`,traitRaw=confidenceFor(raw,traitPath),traitComponents=baseComponents(geometry.value,diag.traitMatchScore),traitSame=diag.normalizedTrait===emblem.trait;
      let traitReason:ScreenshotEvidenceClass='fuzzy-trait';
      if(traitSame&&(diag.traitMatchScore>=.99||normalized(diag.rawTraitText).includes(normalized(emblem.trait)))){traitComponents.structuredEvidence=.96;traitReason=traitRaw>=.9?'targeted-native-trait':'exact-domain-trait';}
      else if(!traitSame){traitComponents.fieldConsistency=.7;traitReason='conflicting-retry';}
      if(geometry.reason) traitReason=geometry.reason;
      calibrated.push(calibrateConfidenceEvidence(traitPath,{resolved:TRAITS.includes(emblem.trait),rawConfidence:traitRaw,reason:traitReason,components:traitComponents}));
    }
  }

  raw.operationIds.forEach((operationId,index)=>{
    const path=`operationIds.${index}`,rawConfidence=confidenceFor(raw,path),actionText=metrics.diagnostic.actionEvidence.cardTexts[index]??'',actionMatch=matchActionText(actionText),components=baseComponents(geometry.value,actionMatch?.score??rawConfidence);
    const actionEvidence=metrics.diagnostic.actionEvidence as typeof metrics.diagnostic.actionEvidence & {independentAgreement?:boolean[]};
    const independentAgreement=actionEvidence.independentAgreement?.[index]===true;
    const catalogAgreement=operationId!==null&&actionMatch?.id===operationId&&actionEvidence.resolved[index]===operationId;
    const decisiveCatalogMatch=Boolean(catalogAgreement&&actionMatch&&((actionMatch.score>=.65&&actionMatch.margin>=.05)||(independentAgreement&&actionMatch.score>=.5)));
    const actionResolved=operationId!==null&&(decisiveCatalogMatch||rawConfidence>=.9);
    let reason:ScreenshotEvidenceClass=decisiveCatalogMatch?'dedicated-action-crop':(operationId!==null?'fuzzy-action':'unresolved');
    if(decisiveCatalogMatch)components.structuredEvidence=independentAgreement?.98:.96;
    else if(operationId!==null&&rawConfidence>=.9)components.structuredEvidence=.95;
    if(geometry.reason&&operationId!==null) reason=geometry.reason;
    calibrated.push(calibrateConfidenceEvidence(path,{resolved:actionResolved,rawConfidence,reason,components}));
  });

  const tokenPath='tokensRemaining',tokenRaw=confidenceFor(raw,tokenPath),tokenEvidence=metrics.diagnostic.tokenEvidence,tokenComponents=baseComponents(geometry.value,tokenEvidence.confidence);
  let tokenReason:ScreenshotEvidenceClass=raw.tokensRemaining===undefined?'unresolved':'fuzzy-token';
  if(raw.tokensRemaining!==undefined&&tokenEvidence.value===raw.tokensRemaining&&tokenEvidence.confidence>=.9&&/TOKENS?/i.test(tokenEvidence.rawText)){tokenComponents.structuredEvidence=.96;tokenReason='direct-token';}
  if(geometry.reason&&raw.tokensRemaining!==undefined) tokenReason=geometry.reason;
  calibrated.push(calibrateConfidenceEvidence(tokenPath,{resolved:raw.tokensRemaining!==undefined,rawConfidence:tokenRaw,reason:tokenReason,components:tokenComponents}));

  raw.fieldConfidence=calibrated;
  for(const emblem of metrics.diagnostic.emblems){
    const prefix=`banners.${emblem.role}.emblems.${emblem.rowIndex}.`;
    const fieldRows=calibrated.filter(field=>field.path.startsWith(prefix));
    emblem.finalConfidence=fieldRows.length?Math.min(...fieldRows.map(field=>field.confidence)):0;
    emblem.reviewRequired=fieldRows.some(field=>field.confidence<REVIEW_THRESHOLD);
  }
  const diagnostic=metrics.diagnostic as typeof metrics.diagnostic & {confidenceModel?:string;fieldConfidence?:ScreenshotFieldConfidence[]};
  diagnostic.confidenceModel='structured-evidence-v2';
  diagnostic.fieldConfidence=calibrated.map(field=>({...field,components:field.components?{...field.components}:undefined}));
}

export function screenshotImportRequest(imageDataUrl:string,data:DataBundle):ScreenshotImportRequest {
  const teamsByRole=Object.fromEntries(ROLES.map(role=>[role,[...new Set(data.players.filter(p=>p.role===role).map(p=>p.team))].sort()])) as Record<Role,string[]>;
  return {imageDataUrl,teamsByRole,actions:ACTION_CATALOG.map(action=>({id:action.id,label:action.label}))};
}

export function validateScreenshotImport(raw:unknown,data:DataBundle,currentBoard:BoardState,currentMenu:MenuState):ValidatedScreenshotImport {
  assertRecord(raw,'Screenshot import');
  const layoutId=asLayoutId(raw.layoutId); assertRecord(raw.banners,'Screenshot banners');
  const layout=BOARD_LAYOUTS[layoutId],board={} as BoardState;
  for(const role of ROLES){
    const rb=raw.banners[role]; assertRecord(rb,`${role} banner`); const selectedTeam=asTeam(rb.selectedTeam,role,data),re=rb.emblems;
    if(!Array.isArray(re)) throw new Error(`${role} emblems are missing.`);
    const slots=layout.roles[role]; if(re.length!==slots.length) throw new Error(`${role} has ${re.length} parsed emblems but ${layoutId} requires ${slots.length}.`);
    const emblems=slots.map((slot,index)=>{
      const c=re[index]; assertRecord(c,`${role} emblem ${index+1}`);
      if(c.position!==slot.index) throw new Error(`${role} emblem ${index+1} has the wrong position.`);
      if(c.color!==slot.color) throw new Error(`${role} emblem ${index+1} color conflicts with the ${layoutId} layout.`);
      if(typeof c.stat!=='string'||!isLegalStat(slot.color,c.stat as StatName)) throw new Error(`${role} emblem ${index+1} returned an illegal ${slot.color} stat.`);
      return {id:`${role}-${slot.index}`,position:slot.index,color:slot.color,stat:c.stat as StatName,qualityTier:asTier(c.qualityTier,`${role} emblem ${index+1}`),trait:asTrait(c.trait,`${role} emblem ${index+1}`)} satisfies EmblemState;
    }) as BannerEmblems;
    board[role]={role,selectedTeam,expectedSeries:currentBoard[role].expectedSeries,emblems};
  }
  if(layoutId!=='legacy_3') board.layoutId=layoutId;
  if(!Array.isArray(raw.operationIds)||raw.operationIds.length!==3) throw new Error('Screenshot parser must return exactly three offered-action slots.');
  const fc=confidences(raw.fieldConfidence),warnings=Array.isArray(raw.warnings)?raw.warnings.filter((x):x is string=>typeof x==='string'&&x.trim().length>0):[],resolved:string[]=[];
  raw.operationIds.forEach((v,index)=>{
    if(v===null){resolved.push(currentMenu[index]!.id);if(!fc.some(x=>x.path===`operationIds.${index}`))fc.push({path:`operationIds.${index}`,confidence:0,reason:'unresolved'});if(!warnings.some(x=>x.includes(`Action ${index+1}`)))warnings.push(`Action ${index+1} was not visible; existing action preserved until reviewed.`);return;}
    if(typeof v!=='string'||!ACTION_BY_ID.has(v)) throw new Error(`Screenshot parser returned unknown action: ${String(v)}.`);
    const actionConfidence=fc.find(x=>x.path===`operationIds.${index}`)?.confidence??0;if(actionConfidence<REVIEW_THRESHOLD){resolved.push(currentMenu[index]!.id);warnings.push(`Action ${index+1} OCR was not strong enough to replace the existing action; preserved until reviewed.`);return;}
    resolved.push(v);
  });
  const visible=raw.operationIds.filter((v):v is string=>typeof v==='string'); if(new Set(visible).size!==visible.length) throw new Error('Screenshot parser returned duplicate offered actions.');
  const menu=resolved.map(id=>cloneAction(ACTION_BY_ID.get(id)!)) as MenuState;
  let tokensRemaining:number|undefined;
  if(raw.tokensRemaining!==undefined){if(!Number.isInteger(raw.tokensRemaining)||Number(raw.tokensRemaining)<0)throw new Error('Screenshot parser returned an invalid token count.');tokensRemaining=Number(raw.tokensRemaining);}
  const lowConfidenceFields=fc.filter(field=>field.confidence<REVIEW_THRESHOLD);
  const result:ValidatedScreenshotImport={board,menu,warnings,lowConfidenceFields,requiresReview:lowConfidenceFields.length>0};
  if(tokensRemaining!==undefined) result.tokensRemaining=tokensRemaining;
  return result;
}

export async function fileToScreenshotDataUrl(file:File,maxDimension=1800):Promise<string> {
  if(!file.type.startsWith('image/')) throw new Error('Choose an image screenshot (PNG, JPEG, or WebP).');
  const source=await new Promise<HTMLImageElement>((ok,no)=>{const image=new Image(),url=URL.createObjectURL(file);image.onload=()=>{URL.revokeObjectURL(url);ok(image);};image.onerror=()=>{URL.revokeObjectURL(url);no(new Error('The selected screenshot could not be decoded.'));};image.src=url;});
  const scale=Math.min(1,maxDimension/Math.max(source.naturalWidth,source.naturalHeight)),canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(source.naturalWidth*scale));canvas.height=Math.max(1,Math.round(source.naturalHeight*scale));
  const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas image processing is unavailable in this browser.'); ctx.drawImage(source,0,0,canvas.width,canvas.height); return canvas.toDataURL('image/jpeg',.9);
}
async function visionFallback(file:File,data:DataBundle):Promise<RawScreenshotImport> {
  const endpoint=document.querySelector<HTMLMetaElement>('meta[name="screenshot-import-endpoint"]')?.content; if(!endpoint) throw new Error('Local OCR could not confidently reconstruct this screenshot.');
  const imageDataUrl=await fileToScreenshotDataUrl(file),response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(screenshotImportRequest(imageDataUrl,data))});
  if(!response.ok){const detail=await response.text().catch(()=> '');throw new Error(`Screenshot recognition failed (${response.status})${detail?`: ${detail.slice(0,240)}`:'.'}`);} return await response.json() as RawScreenshotImport;
}
export async function requestScreenshotImport(file:File,data:DataBundle):Promise<RawScreenshotImport> {
  lastLocalOcrMetrics=undefined;
  try{
    const local=await parseScreenshotLocally(file,data);
    // Resolve fields from structured evidence before expensive targeted OCR. Refinement now runs only where it can change the decision.
    calibrateScreenshotImportConfidence(local.result,local.metrics,data);
    const refined=await refineUncertainScreenshotFields(file,data,local.result,local.metrics);
    local.metrics.targetedRetryMs+=refined.elapsedMs; local.metrics.totalMs+=refined.elapsedMs;
    calibrateScreenshotImportConfidence(refined.result,local.metrics,data);
    lastLocalOcrMetrics=local.metrics;
    return refined.result;
  }catch(localError){
    const endpoint=document.querySelector<HTMLMetaElement>('meta[name="screenshot-import-endpoint"]')?.content; if(!endpoint) throw localError;
    try{return await visionFallback(file,data);}catch(fallbackError){
      const localMessage=localError instanceof Error?`${localError.name}: ${localError.message}`:String(localError);
      const fallbackMessage=fallbackError instanceof Error?`${fallbackError.name}: ${fallbackError.message}`:String(fallbackError);
      const combined=new Error(`Local screenshot OCR failed (${localMessage}); hosted fallback also failed (${fallbackMessage}).`);
      (combined as Error & {cause?:unknown}).cause=localError;
      throw combined;
    }
  }
}
