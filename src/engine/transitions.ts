import type {
  BoardState, ColoredRerollOperation, GlobalQualityOperation, OfferedOperation,
  QualityTier, Role, SlotColor, StatName, StatRerollOperation, TraitName
} from '../domain/types.js';
import { DEFAULT_LAYOUT_ID, legalStats } from '../domain/rules.js';

export interface BoardTransition { board: BoardState; probability: number; note?: string; }

const QUALITY_TIERS: readonly QualityTier[] = [1,2,3,4,5];
const TRAITS: readonly TraitName[] = ['Fractal','Friendly','Vampiric','Unique','Benevolent'];

function cloneBoard(board: BoardState): BoardState {
  const out={
    core: { ...board.core, emblems: board.core.emblems.map(e => ({...e})) as BoardState['core']['emblems'] },
    mid: { ...board.mid, emblems: board.mid.emblems.map(e => ({...e})) as BoardState['mid']['emblems'] },
    support: { ...board.support, emblems: board.support.emblems.map(e => ({...e})) as BoardState['support']['emblems'] },
  } as BoardState;
  if(board.layoutId)out.layoutId=board.layoutId;
  return out;
}

function aggregate(outcomes: BoardTransition[]): BoardTransition[] {
  const grouped = new Map<string, BoardTransition>();
  for (const outcome of outcomes) {
    const key = JSON.stringify(outcome.board);
    const prior = grouped.get(key);
    if (prior) prior.probability += outcome.probability;
    else grouped.set(key,{...outcome});
  }
  return [...grouped.values()].filter(x=>x.probability>0);
}

function matchingIndices(board:BoardState,role:Role,color:SlotColor):number[] {
  return board[role].emblems.map((e,i)=>e.color===color?i:-1).filter(i=>i>=0);
}

function targetChoices(matching:number[],scope:'all_matching'|'first_matching'|'last_matching'|'random_matching'):{indices:number[];probability:number;note?:string}[] {
  if (!matching.length) return [];
  if (scope==='all_matching') return [{indices:matching,probability:1}];
  if (scope==='first_matching') return [{indices:[matching[0]!],probability:1}];
  if (scope==='last_matching') return [{indices:[matching[matching.length-1]!],probability:1}];
  return matching.map(i=>({indices:[i],probability:1/matching.length,note:`Random target: slot ${i+1}.`}));
}

function weightedCandidates(op: StatRerollOperation, candidates: readonly StatName[], uniformFallback: boolean): [StatName, number][] {
  if (op.outcomeWeights) {
    const weighted = candidates
      .map(s => [s, Math.max(0, op.outcomeWeights?.[s] ?? 0)] as [StatName,number])
      .filter(x => x[1] > 0);
    if (weighted.length) return weighted;
  }
  if (!uniformFallback) return [];
  return candidates.map(s => [s, 1]);
}

export function enumerateStatReroll(board: BoardState, role: Role, op: StatRerollOperation, uniformFallback=true): BoardTransition[] {
  const banner = board[role];
  const matching = matchingIndices(board,role,op.color);
  if (!matching.length) return [];
  const allOutcomes: BoardTransition[] = [];

  for (const choice of targetChoices(matching,op.scope)) {
    const indices=choice.indices;
    const targetSet=new Set(indices);
    const fixedStats=new Set<StatName>(banner.emblems.filter((_,i)=>!targetSet.has(i)).map(e=>e.stat));
    const originalByIndex=new Map(indices.map(i=>[i,banner.emblems[i]!.stat] as const));
    const pool=legalStats(op.color);

    const recurse=(depth:number,next:BoardState,probability:number,used:Set<StatName>)=>{
      if(depth>=indices.length){
        const outcome:BoardTransition={board:next,probability};if(choice.note)outcome.note=choice.note;allOutcomes.push(outcome);
        return;
      }
      const idx=indices[depth]!;
      const original=originalByIndex.get(idx)!;
      const candidates=pool.filter(stat=>stat!==original&&!used.has(stat));
      const weighted=weightedCandidates(op,candidates,uniformFallback);
      const totalWeight=weighted.reduce((s,x)=>s+x[1],0);
      if(totalWeight<=0)return;
      for(const [stat,weight] of weighted){
        const copy=cloneBoard(next);
        copy[role].emblems[idx]={...copy[role].emblems[idx]!,stat};
        const nextUsed=new Set(used);nextUsed.add(stat);
        recurse(depth+1,copy,probability*weight/totalWeight,nextUsed);
      }
    };
    recurse(0,cloneBoard(board),choice.probability,fixedStats);
  }
  return aggregate(allOutcomes);
}

export function enumerateQualityReroll(board:BoardState,role:Role,op:ColoredRerollOperation):BoardTransition[] {
  if(op.kind!=='quality_reroll')return [];
  const choices=targetChoices(matchingIndices(board,role,op.color),op.scope);
  const out:BoardTransition[]=[];
  for(const choice of choices){
    const recurse=(depth:number,next:BoardState,p:number)=>{
      if(depth>=choice.indices.length){const outcome:BoardTransition={board:next,probability:p};if(choice.note)outcome.note=choice.note;out.push(outcome);return;}
      const idx=choice.indices[depth]!;
      const current=next[role].emblems[idx]!.qualityTier;
      const candidates=QUALITY_TIERS.filter(t=>t!==current);
      for(const tier of candidates){
        const copy=cloneBoard(next);copy[role].emblems[idx]={...copy[role].emblems[idx]!,qualityTier:tier};
        recurse(depth+1,copy,p/candidates.length);
      }
    };
    recurse(0,cloneBoard(board),choice.probability);
  }
  return aggregate(out);
}

export function enumerateTraitReroll(board:BoardState,role:Role,op:ColoredRerollOperation):BoardTransition[] {
  if(op.kind!=='trait_reroll')return [];
  const choices=targetChoices(matchingIndices(board,role,op.color),op.scope);
  const out:BoardTransition[]=[];
  for(const choice of choices){
    const recurse=(depth:number,next:BoardState,p:number)=>{
      if(depth>=choice.indices.length){const outcome:BoardTransition={board:next,probability:p};if(choice.note)outcome.note=choice.note;out.push(outcome);return;}
      const idx=choice.indices[depth]!;
      const current=next[role].emblems[idx]!.trait;
      const candidates=TRAITS.filter(t=>t!==current);
      for(const trait of candidates){
        const copy=cloneBoard(next);copy[role].emblems[idx]={...copy[role].emblems[idx]!,trait};
        recurse(depth+1,copy,p/candidates.length);
      }
    };
    recurse(0,cloneBoard(board),choice.probability);
  }
  return aggregate(out);
}

function directionalTiers(current:QualityTier,direction:'increase'|'decrease'):QualityTier[]{
  return QUALITY_TIERS.filter(t=>direction==='increase'?t>current:t<current);
}

function directionalTierOutcomes(current:QualityTier,direction:'increase'|'decrease'):{tier:QualityTier;probability:number}[]{
  const candidates=directionalTiers(current,direction);
  if(!candidates.length)return [{tier:current,probability:1}];
  return candidates.map(tier=>({tier,probability:1/candidates.length}));
}

/** Randomly choose one emblem from the complete layout-defined banner, then increase uniformly to any higher tier. */
export function enumerateQualityIncrease(board:BoardState,role:Role,op:GlobalQualityOperation):BoardTransition[]{
  if(op.kind!=='quality_increase')return [];
  const out:BoardTransition[]=[],count=board[role].emblems.length;
  for(let idx=0;idx<count;idx++){
    const current=board[role].emblems[idx]!.qualityTier;
    for(const x of directionalTierOutcomes(current,'increase')){
      const copy=cloneBoard(board);copy[role].emblems[idx]={...copy[role].emblems[idx]!,qualityTier:x.tier};
      out.push({board:copy,probability:(1/count)*x.probability,note:`Randomly selected slot ${idx+1} to increase.`});
    }
  }
  return aggregate(out);
}

/** Verified only for legacy_3: one slot decreases and the other two increase. */
export function enumerateQualityRedistribution(board:BoardState,role:Role,op:GlobalQualityOperation):BoardTransition[]{
  if(op.kind!=='quality_redistribution')return [];
  if((board.layoutId??DEFAULT_LAYOUT_ID)!=='legacy_3')return [];
  const out:BoardTransition[]=[];
  for(let downIdx=0;downIdx<3;downIdx++){
    const recurse=(idx:number,next:BoardState,p:number)=>{
      if(idx>=3){out.push({board:next,probability:p,note:`Randomly selected slot ${downIdx+1} to decrease; the other two increase.`});return;}
      const current=next[role].emblems[idx]!.qualityTier,direction=idx===downIdx?'decrease':'increase';
      for(const x of directionalTierOutcomes(current,direction)){
        const copy=cloneBoard(next);copy[role].emblems[idx]={...copy[role].emblems[idx]!,qualityTier:x.tier};
        recurse(idx+1,copy,p*x.probability);
      }
    };
    recurse(0,cloneBoard(board),1/3);
  }
  return aggregate(out);
}

export function enumerateOperation(board: BoardState, role: Role, op: OfferedOperation, uniformFallback=true): BoardTransition[] {
  if(op.kind==='stat_reroll')return enumerateStatReroll(board,role,op,uniformFallback);
  if(op.kind==='quality_reroll')return enumerateQualityReroll(board,role,op);
  if(op.kind==='trait_reroll')return enumerateTraitReroll(board,role,op);
  if(op.kind==='quality_increase')return enumerateQualityIncrease(board,role,op);
  if(op.kind==='quality_redistribution')return enumerateQualityRedistribution(board,role,op);
  return [];
}
