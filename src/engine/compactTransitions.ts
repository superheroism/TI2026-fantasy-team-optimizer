import type {
  ColoredRerollOperation,
  GlobalQualityOperation,
  MatchingScope,
  OfferedOperation,
  QualityTier,
  Role,
  StatName,
  StatRerollOperation,
} from '../domain/types.js';
import { BANNER_COLORS, LEGAL_STAT_POOLS } from '../domain/rules.js';
import {
  TRAIT_COUNT,
  decodeBannerEmblemIds,
  emblemQualityTier,
  emblemStatIndex,
  emblemTraitIndex,
  encodeBannerEmblemIds,
  encodeEmblemComponents,
  replaceEngineBanner,
} from './stateEncoding.js';
import type { BannerStateID, EmblemStateID, EngineState } from './stateEncoding.js';

export interface CompactBannerTransition {
  readonly banner: BannerStateID;
  readonly probability: number;
  readonly note?: string;
}

export interface EngineTransition {
  readonly nextState: EngineState;
  readonly probability: number;
  readonly note?: string;
}

export interface TransitionDiagnostics {
  readonly cacheHits: number;
  readonly cacheMisses: number;
  readonly uniqueTransitionCalculations: number;
  readonly outcomesBeforeAggregation: number;
  readonly outcomesAfterAggregation: number;
  readonly transitionGenerationMs: number;
}

interface MutableTransitionDiagnostics {
  cacheHits: number;
  cacheMisses: number;
  uniqueTransitionCalculations: number;
  outcomesBeforeAggregation: number;
  outcomesAfterAggregation: number;
  transitionGenerationMs: number;
}

const QUALITY_TIERS: readonly QualityTier[] = [1,2,3,4,5];
const ROLES: readonly Role[] = ['core','mid','support'];

function newDiagnostics():MutableTransitionDiagnostics {
  return {
    cacheHits:0,
    cacheMisses:0,
    uniqueTransitionCalculations:0,
    outcomesBeforeAggregation:0,
    outcomesAfterAggregation:0,
    transitionGenerationMs:0,
  };
}

let diagnostics=newDiagnostics();

/** role -> compact banner ID -> mechanics-only operation key -> cached distribution */
const transitionCache = new Map<Role,Map<BannerStateID,Map<string,readonly CompactBannerTransition[]>>>(
  ROLES.map(role=>[role,new Map()] as const),
);

export function clearTransitionCache():void {
  for(const cache of transitionCache.values()) cache.clear();
}

export function resetTransitionDiagnostics():void { diagnostics=newDiagnostics(); }

export function getTransitionDiagnostics():TransitionDiagnostics { return {...diagnostics}; }

function operationKey(op:OfferedOperation,uniformStatFallback:boolean):string {
  if(op.kind==='stat_reroll') {
    const weights=op.outcomeWeights
      ? LEGAL_STAT_POOLS[op.color].map(stat=>`${stat}:${op.outcomeWeights?.[stat] ?? 0}`).join(',')
      : '-';
    return `s|${op.color}|${op.scope}|${op.excludeCurrent?1:0}|${uniformStatFallback?1:0}|${weights}`;
  }
  if(op.kind==='quality_reroll') return `q|${op.color}|${op.scope}`;
  if(op.kind==='trait_reroll') return `t|${op.color}|${op.scope}`;
  if(op.kind==='quality_increase') return 'i';
  return 'r';
}

function matchingIndices(role:Role,color:'red'|'green'|'blue'):number[] {
  const colors=BANNER_COLORS[role];
  return colors.map((slotColor,index)=>slotColor===color?index:-1).filter(index=>index>=0);
}

function targetChoices(matching:number[],scope:MatchingScope):{indices:number[];probability:number;note?:string}[] {
  if(!matching.length)return [];
  if(scope==='all_matching')return [{indices:matching,probability:1}];
  if(scope==='first_matching')return [{indices:[matching[0]!],probability:1}];
  if(scope==='last_matching')return [{indices:[matching[matching.length-1]!],probability:1}];
  return matching.map(index=>({indices:[index],probability:1/matching.length,note:`Random target: slot ${index+1}.`}));
}

function aggregate(outcomes:CompactBannerTransition[]):readonly CompactBannerTransition[] {
  diagnostics.outcomesBeforeAggregation+=outcomes.length;
  const grouped=new Map<BannerStateID,{banner:BannerStateID;probability:number;note?:string}>();
  for(const outcome of outcomes) {
    const prior=grouped.get(outcome.banner);
    if(prior) prior.probability+=outcome.probability;
    else grouped.set(outcome.banner,{...outcome});
  }
  const result=[...grouped.values()].filter(outcome=>outcome.probability>0);
  diagnostics.outcomesAfterAggregation+=result.length;
  return result;
}

function withSlot(ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID],index:number,next:EmblemStateID):readonly [EmblemStateID,EmblemStateID,EmblemStateID] {
  if(index===0)return [next,ids[1],ids[2]];
  if(index===1)return [ids[0],next,ids[2]];
  return [ids[0],ids[1],next];
}

function bannerId(ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID]):BannerStateID {
  return encodeBannerEmblemIds(ids[0],ids[1],ids[2]);
}

function statName(role:Role,index:number,id:EmblemStateID):StatName {
  const color=BANNER_COLORS[role][index as 0|1|2];
  return LEGAL_STAT_POOLS[color][emblemStatIndex(id)]!;
}

function weightedCandidates(op:StatRerollOperation,candidates:readonly StatName[],uniformFallback:boolean):readonly [StatName,number][] {
  if(op.outcomeWeights) {
    const weighted=candidates
      .map(stat=>[stat,Math.max(0,op.outcomeWeights?.[stat]??0)] as [StatName,number])
      .filter(([,weight])=>weight>0);
    if(weighted.length)return weighted;
  }
  if(!uniformFallback)return [];
  return candidates.map(stat=>[stat,1] as [StatName,number]);
}

function enumerateStatReroll(role:Role,banner:BannerStateID,op:StatRerollOperation,uniformFallback:boolean):readonly CompactBannerTransition[] {
  const source=decodeBannerEmblemIds(banner);
  const matching=matchingIndices(role,op.color);
  if(!matching.length)return [];
  const out:CompactBannerTransition[]=[];

  for(const choice of targetChoices(matching,op.scope)) {
    const targetSet=new Set(choice.indices);
    const fixedStats=new Set<StatName>();
    for(let index=0;index<3;index++) if(!targetSet.has(index)) fixedStats.add(statName(role,index,source[index as 0|1|2]));
    const originals=new Map(choice.indices.map(index=>[index,statName(role,index,source[index as 0|1|2])] as const));
    const pool=LEGAL_STAT_POOLS[op.color];

    const recurse=(depth:number,ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID],probability:number,used:Set<StatName>):void=>{
      if(depth>=choice.indices.length) {
        const outcome:CompactBannerTransition=choice.note
          ? {banner:bannerId(ids),probability,note:choice.note}
          : {banner:bannerId(ids),probability};
        out.push(outcome);
        return;
      }
      const index=choice.indices[depth]!;
      const original=originals.get(index)!;
      const candidates=pool.filter(stat=>stat!==original&&!used.has(stat));
      const weighted=weightedCandidates(op,candidates,uniformFallback);
      const totalWeight=weighted.reduce((sum,[,weight])=>sum+weight,0);
      if(totalWeight<=0)return;
      const currentId=ids[index as 0|1|2];
      const quality=emblemQualityTier(currentId);
      const trait=emblemTraitIndex(currentId);
      for(const [nextStat,weight] of weighted) {
        const nextStatIndex=pool.indexOf(nextStat);
        const nextId=encodeEmblemComponents(nextStatIndex,quality,trait);
        const nextUsed=new Set(used);nextUsed.add(nextStat);
        recurse(depth+1,withSlot(ids,index,nextId),probability*weight/totalWeight,nextUsed);
      }
    };
    recurse(0,source,choice.probability,fixedStats);
  }
  return aggregate(out);
}

function enumerateQualityReroll(role:Role,banner:BannerStateID,op:ColoredRerollOperation):readonly CompactBannerTransition[] {
  if(op.kind!=='quality_reroll')return [];
  const source=decodeBannerEmblemIds(banner);
  const out:CompactBannerTransition[]=[];
  for(const choice of targetChoices(matchingIndices(role,op.color),op.scope)) {
    const recurse=(depth:number,ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID],probability:number):void=>{
      if(depth>=choice.indices.length) {
        const outcome:CompactBannerTransition=choice.note
          ? {banner:bannerId(ids),probability,note:choice.note}
          : {banner:bannerId(ids),probability};
        out.push(outcome);return;
      }
      const index=choice.indices[depth]!;
      const currentId=ids[index as 0|1|2];
      const current=emblemQualityTier(currentId);
      const stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId);
      const candidates=QUALITY_TIERS.filter(tier=>tier!==current);
      for(const tier of candidates) recurse(depth+1,withSlot(ids,index,encodeEmblemComponents(stat,tier,trait)),probability/candidates.length);
    };
    recurse(0,source,choice.probability);
  }
  return aggregate(out);
}

function enumerateTraitReroll(role:Role,banner:BannerStateID,op:ColoredRerollOperation):readonly CompactBannerTransition[] {
  if(op.kind!=='trait_reroll')return [];
  const source=decodeBannerEmblemIds(banner);
  const out:CompactBannerTransition[]=[];
  for(const choice of targetChoices(matchingIndices(role,op.color),op.scope)) {
    const recurse=(depth:number,ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID],probability:number):void=>{
      if(depth>=choice.indices.length) {
        const outcome:CompactBannerTransition=choice.note
          ? {banner:bannerId(ids),probability,note:choice.note}
          : {banner:bannerId(ids),probability};
        out.push(outcome);return;
      }
      const index=choice.indices[depth]!;
      const currentId=ids[index as 0|1|2];
      const current=emblemTraitIndex(currentId);
      const stat=emblemStatIndex(currentId),quality=emblemQualityTier(currentId);
      for(let trait=0;trait<TRAIT_COUNT;trait++) {
        if(trait===current)continue;
        recurse(depth+1,withSlot(ids,index,encodeEmblemComponents(stat,quality,trait)),probability/(TRAIT_COUNT-1));
      }
    };
    recurse(0,source,choice.probability);
  }
  return aggregate(out);
}

function directionalTierOutcomes(current:QualityTier,direction:'increase'|'decrease'):readonly {tier:QualityTier;probability:number}[] {
  const candidates=QUALITY_TIERS.filter(tier=>direction==='increase'?tier>current:tier<current);
  if(!candidates.length)return [{tier:current,probability:1}];
  return candidates.map(tier=>({tier,probability:1/candidates.length}));
}

function enumerateQualityIncrease(banner:BannerStateID,op:GlobalQualityOperation):readonly CompactBannerTransition[] {
  if(op.kind!=='quality_increase')return [];
  const source=decodeBannerEmblemIds(banner);
  const out:CompactBannerTransition[]=[];
  for(const index of [0,1,2] as const) {
    const currentId=source[index],current=emblemQualityTier(currentId);
    const stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId);
    for(const next of directionalTierOutcomes(current,'increase')) {
      out.push({
        banner:bannerId(withSlot(source,index,encodeEmblemComponents(stat,next.tier,trait))),
        probability:(1/3)*next.probability,
        note:`Randomly selected slot ${index+1} to increase.`,
      });
    }
  }
  return aggregate(out);
}

function enumerateQualityRedistribution(banner:BannerStateID,op:GlobalQualityOperation):readonly CompactBannerTransition[] {
  if(op.kind!=='quality_redistribution')return [];
  const source=decodeBannerEmblemIds(banner);
  const out:CompactBannerTransition[]=[];
  for(const downIndex of [0,1,2] as const) {
    const recurse=(index:number,ids:readonly [EmblemStateID,EmblemStateID,EmblemStateID],probability:number):void=>{
      if(index>=3) {
        out.push({banner:bannerId(ids),probability,note:`Randomly selected slot ${downIndex+1} to decrease; the other two increase.`});
        return;
      }
      const position=index as 0|1|2;
      const currentId=ids[position],quality=emblemQualityTier(currentId);
      const stat=emblemStatIndex(currentId),trait=emblemTraitIndex(currentId);
      const direction=position===downIndex?'decrease':'increase';
      for(const next of directionalTierOutcomes(quality,direction)) {
        recurse(index+1,withSlot(ids,position,encodeEmblemComponents(stat,next.tier,trait)),probability*next.probability);
      }
    };
    recurse(0,source,1/3);
  }
  return aggregate(out);
}

function calculateBannerOperation(role:Role,banner:BannerStateID,op:OfferedOperation,uniformStatFallback:boolean):readonly CompactBannerTransition[] {
  if(op.kind==='stat_reroll')return enumerateStatReroll(role,banner,op,uniformStatFallback);
  if(op.kind==='quality_reroll')return enumerateQualityReroll(role,banner,op);
  if(op.kind==='trait_reroll')return enumerateTraitReroll(role,banner,op);
  if(op.kind==='quality_increase')return enumerateQualityIncrease(banner,op);
  if(op.kind==='quality_redistribution')return enumerateQualityRedistribution(banner,op);
  return [];
}

export function enumerateCompactBannerOperation(
  role:Role,
  banner:BannerStateID,
  op:OfferedOperation,
  uniformStatFallback=true,
):readonly CompactBannerTransition[] {
  const roleCache=transitionCache.get(role)!;
  let bannerCache=roleCache.get(banner);
  if(!bannerCache){bannerCache=new Map();roleCache.set(banner,bannerCache);}
  const key=operationKey(op,uniformStatFallback);
  const prior=bannerCache.get(key);
  if(prior){diagnostics.cacheHits++;return prior;}

  diagnostics.cacheMisses++;
  diagnostics.uniqueTransitionCalculations++;
  const start=performance.now();
  const result=calculateBannerOperation(role,banner,op,uniformStatFallback);
  diagnostics.transitionGenerationMs+=performance.now()-start;
  bannerCache.set(key,result);
  return result;
}

/**
 * Compact transition API used by search. Only the targeted role-local banner ID
 * changes; the two unchanged role IDs are structurally reused in every outcome.
 */
export function enumerateEngineOperation(
  state:EngineState,
  role:Role,
  op:OfferedOperation,
  uniformStatFallback=true,
):readonly EngineTransition[] {
  const banner=state[role];
  return enumerateCompactBannerOperation(role,banner,op,uniformStatFallback).map(outcome=>{
    const nextState=replaceEngineBanner(state,role,outcome.banner);
    return outcome.note
      ? {nextState,probability:outcome.probability,note:outcome.note}
      : {nextState,probability:outcome.probability};
  });
}
