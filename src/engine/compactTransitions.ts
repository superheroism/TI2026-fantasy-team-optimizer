import type {
  BoardLayoutId, ColoredRerollOperation, GlobalQualityOperation, MatchingScope, OfferedOperation,
  QualityTier, Role, SlotColor, StatName, StatRerollOperation,
} from '../domain/types.js';
import { DEFAULT_LAYOUT_ID, LEGAL_STAT_POOLS, boardLayout } from '../domain/rules.js';
import {
  TRAIT_COUNT, decodeBannerEmblemIds, emblemQualityTier, emblemStatIndex, emblemTraitIndex,
  encodeBannerEmblemIds, encodeEmblemComponents, replaceEngineBanner,
} from './stateEncoding.js';
import type { BannerStateID, EmblemStateID, EngineState } from './stateEncoding.js';

export interface CompactBannerTransition { readonly banner:BannerStateID; readonly probability:number; readonly note?:string; }
export interface EngineTransition { readonly nextState:EngineState; readonly probability:number; readonly note?:string; }
export interface TransitionDiagnostics { readonly cacheHits:number; readonly cacheMisses:number; readonly uniqueTransitionCalculations:number; readonly outcomesBeforeAggregation:number; readonly outcomesAfterAggregation:number; readonly transitionGenerationMs:number; }
interface MutableTransitionDiagnostics { cacheHits:number;cacheMisses:number;uniqueTransitionCalculations:number;outcomesBeforeAggregation:number;outcomesAfterAggregation:number;transitionGenerationMs:number; }

const QUALITY_TIERS:readonly QualityTier[]=[1,2,3,4,5];
function newDiagnostics():MutableTransitionDiagnostics{return{cacheHits:0,cacheMisses:0,uniqueTransitionCalculations:0,outcomesBeforeAggregation:0,outcomesAfterAggregation:0,transitionGenerationMs:0};}
let diagnostics=newDiagnostics();
const transitionCache=new Map<string,Map<BannerStateID,Map<string,readonly CompactBannerTransition[]>>>();
export function clearTransitionCache():void{transitionCache.clear();}
export function resetTransitionDiagnostics():void{diagnostics=newDiagnostics();}
export function getTransitionDiagnostics():TransitionDiagnostics{return{...diagnostics};}

function operationKey(op:OfferedOperation,uniformStatFallback:boolean):string{
  if(op.kind==='stat_reroll'){const weights=op.outcomeWeights?LEGAL_STAT_POOLS[op.color].map(stat=>`${stat}:${op.outcomeWeights?.[stat]??0}`).join(','):'-';return`s|${op.color}|${op.scope}|${op.excludeCurrent?1:0}|${uniformStatFallback?1:0}|${weights}`;}
  if(op.kind==='quality_reroll')return`q|${op.color}|${op.scope}`;
  if(op.kind==='trait_reroll')return`t|${op.color}|${op.scope}`;
  if(op.kind==='quality_increase')return'i';
  return'r';
}
function matchingIndices(layoutId:BoardLayoutId,role:Role,color:SlotColor):number[]{return boardLayout(layoutId).roles[role].filter(slot=>slot.color===color).map(slot=>slot.index);}
function targetChoices(matching:number[],scope:MatchingScope):{indices:number[];probability:number;note?:string}[]{
  if(!matching.length)return[];if(scope==='all_matching')return[{indices:matching,probability:1}];if(scope==='first_matching')return[{indices:[matching[0]!],probability:1}];if(scope==='last_matching')return[{indices:[matching[matching.length-1]!],probability:1}];
  return matching.map(index=>({indices:[index],probability:1/matching.length,note:`Random target: slot ${index+1}.`}));
}
function aggregate(outcomes:CompactBannerTransition[]):readonly CompactBannerTransition[]{
  diagnostics.outcomesBeforeAggregation+=outcomes.length;const grouped=new Map<BannerStateID,{banner:BannerStateID;probability:number;note?:string}>();
  for(const outcome of outcomes){const prior=grouped.get(outcome.banner);if(prior)prior.probability+=outcome.probability;else grouped.set(outcome.banner,{...outcome});}
  const result=[...grouped.values()].filter(outcome=>outcome.probability>0);diagnostics.outcomesAfterAggregation+=result.length;return result;
}
function withSlot(ids:readonly EmblemStateID[],index:number,next:EmblemStateID):readonly EmblemStateID[]{const out=[...ids];out[index]=next;return out;}
function bannerId(layoutId:BoardLayoutId,ids:readonly EmblemStateID[]):BannerStateID{return encodeBannerEmblemIds(layoutId,ids);}
function statName(layoutId:BoardLayoutId,role:Role,index:number,id:EmblemStateID):StatName{const slot=boardLayout(layoutId).roles[role][index];if(!slot)throw new RangeError(`No ${layoutId}/${role} slot ${index}.`);return LEGAL_STAT_POOLS[slot.color][emblemStatIndex(id)]!;}
function weightedCandidates(op:StatRerollOperation,candidates:readonly StatName[],uniformFallback:boolean):readonly [StatName,number][]{
  if(op.outcomeWeights){const weighted=candidates.map(stat=>[stat,Math.max(0,op.outcomeWeights?.[stat]??0)] as [StatName,number]).filter(([,weight])=>weight>0);if(weighted.length)return weighted;}return uniformFallback?candidates.map(stat=>[stat,1] as [StatName,number]):[];
}

function enumerateStatReroll(layoutId:BoardLayoutId,role:Role,banner:BannerStateID,op:StatRerollOperation,uniformFallback:boolean):readonly CompactBannerTransition[]{
  const source=decodeBannerEmblemIds(banner,layoutId),matching=matchingIndices(layoutId,role,op.color);if(!matching.length)return[];const out:CompactBannerTransition[]=[];
  for(const choice of targetChoices(matching,op.scope)){
    const targetSet=new Set(choice.indices),fixedStats=new Set<StatName>();for(let index=0;index<source.length;index++)if(!targetSet.has(index))fixedStats.add(statName(layoutId,role,index,source[index]!));
    const originals=new Map(choice.indices.map(index=>[index,statName(layoutId,role,index,source[index]!)] as const)),pool=LEGAL_STAT_POOLS[op.color];
    const recurse=(depth:number,ids:readonly EmblemStateID[],probability:number,used:Set<StatName>):void=>{
      if(depth>=choice.indices.length){out.push(choice.note?{banner:bannerId(layoutId,ids),probability,note:choice.note}:{banner:bannerId(layoutId,ids),probability});return;}
      const index=choice.indices[depth]!,original=originals.get(index)!;
      // Preserve the verified legacy mechanic: a rerolled stat always changes, irrespective of the descriptive flag.
      const candidates=pool.filter(stat=>stat!==original&&!used.has(stat)),weighted=weightedCandidates(op,candidates,uniformFallback),totalWeight=weighted.reduce((sum,[,weight])=>sum+weight,0);if(totalWeight<=0)return;
      const currentId=ids[index]!,quality=emblemQualityTier(currentId),trait=emblemTraitIndex(currentId);
      for(const [nextStat,weight] of weighted){const nextId=encodeEmblemComponents(pool.indexOf(nextStat),quality,trait),nextUsed=new Set(used);nextUsed.add(nextStat);recurse(depth+1,withSlot(ids,index,nextId),probability*weight/totalWeight,nextUsed);}
    };
    recurse(0,source,choice.probability,fixedStats);
  }return aggregate(out);
}
function enumerateQualityReroll(layoutId:BoardLayoutId,role:Role,banner:BannerStateID,op:ColoredRerollOperation):readonly CompactBannerTransition[]{
  if(op.kind!=='quality_reroll')return[];const source=decodeBannerEmblemIds(banner,layoutId),out:CompactBannerTransition[]=[];
  for(const choice of targetChoices(matchingIndices(layoutId,role,op.color),op.scope)){const recurse=(depth:number,ids:readonly EmblemStateID[],probability:number):void=>{if(depth>=choice.indices.length){out.push(choice.note?{banner:bannerId(layoutId,ids),probability,note:choice.note}:{banner:bannerId(layoutId,ids),probability});return;}const index=choice.indices[depth]!,currentId=ids[index]!,current=emblemQualityTier(currentId),stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId),candidates=QUALITY_TIERS.filter(tier=>tier!==current);for(const tier of candidates)recurse(depth+1,withSlot(ids,index,encodeEmblemComponents(stat,tier,trait)),probability/candidates.length);};recurse(0,source,choice.probability);}return aggregate(out);
}
function enumerateTraitReroll(layoutId:BoardLayoutId,role:Role,banner:BannerStateID,op:ColoredRerollOperation):readonly CompactBannerTransition[]{
  if(op.kind!=='trait_reroll')return[];const source=decodeBannerEmblemIds(banner,layoutId),out:CompactBannerTransition[]=[];
  for(const choice of targetChoices(matchingIndices(layoutId,role,op.color),op.scope)){const recurse=(depth:number,ids:readonly EmblemStateID[],probability:number):void=>{if(depth>=choice.indices.length){out.push(choice.note?{banner:bannerId(layoutId,ids),probability,note:choice.note}:{banner:bannerId(layoutId,ids),probability});return;}const index=choice.indices[depth]!,currentId=ids[index]!,current=emblemTraitIndex(currentId),stat=emblemStatIndex(currentId),quality=emblemQualityTier(currentId);for(let trait=0;trait<TRAIT_COUNT;trait++)if(trait!==current)recurse(depth+1,withSlot(ids,index,encodeEmblemComponents(stat,quality,trait)),probability/(TRAIT_COUNT-1));};recurse(0,source,choice.probability);}return aggregate(out);
}
function directionalTierOutcomes(current:QualityTier,direction:'increase'|'decrease'):readonly {tier:QualityTier;probability:number}[]{const candidates=QUALITY_TIERS.filter(tier=>direction==='increase'?tier>current:tier<current);return candidates.length?candidates.map(tier=>({tier,probability:1/candidates.length})):[{tier:current,probability:1}];}
function enumerateQualityIncrease(layoutId:BoardLayoutId,banner:BannerStateID,op:GlobalQualityOperation):readonly CompactBannerTransition[]{
  if(op.kind!=='quality_increase')return[];const source=decodeBannerEmblemIds(banner,layoutId),out:CompactBannerTransition[]=[];
  for(let index=0;index<source.length;index++){const currentId=source[index]!,current=emblemQualityTier(currentId),stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId);for(const next of directionalTierOutcomes(current,'increase'))out.push({banner:bannerId(layoutId,withSlot(source,index,encodeEmblemComponents(stat,next.tier,trait))),probability:(1/source.length)*next.probability,note:`Randomly selected slot ${index+1} to increase.`});}return aggregate(out);
}
function enumerateQualityRedistribution(layoutId:BoardLayoutId,banner:BannerStateID,op:GlobalQualityOperation):readonly CompactBannerTransition[]{
  if(op.kind!=='quality_redistribution')return[];
  if(layoutId!=='legacy_3')return[];
  const source=decodeBannerEmblemIds(banner,layoutId),out:CompactBannerTransition[]=[];
  for(let downIndex=0;downIndex<source.length;downIndex++){const recurse=(index:number,ids:readonly EmblemStateID[],probability:number):void=>{if(index>=source.length){out.push({banner:bannerId(layoutId,ids),probability,note:`Randomly selected slot ${downIndex+1} to decrease; the other two increase.`});return;}const currentId=ids[index]!,quality=emblemQualityTier(currentId),stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId),direction=index===downIndex?'decrease':'increase';for(const next of directionalTierOutcomes(quality,direction))recurse(index+1,withSlot(ids,index,encodeEmblemComponents(stat,next.tier,trait)),probability*next.probability);};recurse(0,source,1/source.length);}return aggregate(out);
}
function calculateBannerOperation(layoutId:BoardLayoutId,role:Role,banner:BannerStateID,op:OfferedOperation,uniformStatFallback:boolean):readonly CompactBannerTransition[]{
  if(op.kind==='stat_reroll')return enumerateStatReroll(layoutId,role,banner,op,uniformStatFallback);
  if(op.kind==='quality_reroll')return enumerateQualityReroll(layoutId,role,banner,op);
  if(op.kind==='trait_reroll')return enumerateTraitReroll(layoutId,role,banner,op);
  if(op.kind==='quality_increase')return enumerateQualityIncrease(layoutId,banner,op);
  if(op.kind==='quality_redistribution')return enumerateQualityRedistribution(layoutId,banner,op);
  return [];
}
export function enumerateCompactBannerOperation(role:Role,banner:BannerStateID,op:OfferedOperation,uniformStatFallback=true,layoutId:BoardLayoutId=DEFAULT_LAYOUT_ID):readonly CompactBannerTransition[]{
  const cacheKey=`${layoutId}|${role}`;let roleCache=transitionCache.get(cacheKey);if(!roleCache){roleCache=new Map();transitionCache.set(cacheKey,roleCache);}let bannerCache=roleCache.get(banner);if(!bannerCache){bannerCache=new Map();roleCache.set(banner,bannerCache);}const key=operationKey(op,uniformStatFallback),prior=bannerCache.get(key);if(prior){diagnostics.cacheHits++;return prior;}
  diagnostics.cacheMisses++;diagnostics.uniqueTransitionCalculations++;const start=performance.now(),result=calculateBannerOperation(layoutId,role,banner,op,uniformStatFallback);diagnostics.transitionGenerationMs+=performance.now()-start;bannerCache.set(key,result);return result;
}
export function enumerateEngineOperation(state:EngineState,role:Role,op:OfferedOperation,uniformStatFallback=true):readonly EngineTransition[]{
  return enumerateCompactBannerOperation(role,state[role],op,uniformStatFallback,state.layoutId).map(outcome=>{const nextState=replaceEngineBanner(state,role,outcome.banner);return outcome.note?{nextState,probability:outcome.probability,note:outcome.note}:{nextState,probability:outcome.probability};});
}
