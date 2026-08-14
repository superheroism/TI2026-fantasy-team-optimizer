import type { BannerState, BoardState, DataBundle, Role } from '../domain/types.js';
import { rankTeamsForRole, rolePrefixFrontier } from './scoring.js';
import { decodeBannerState } from './stateEncoding.js';
import type { BannerStateID, BoardAdapterContext, EngineState } from './stateEncoding.js';

const ROLES: readonly Role[]=['core','mid','support'];
type RoleFrontier=ReturnType<typeof rolePrefixFrontier>;
type RoleFrontierVector=Float64Array;

export interface EngineExpectedScorerDiagnostics {
  readonly bannerMaterializations:number;
  readonly bannerCacheEntries:number;
  readonly bannerCacheHits:number;
  readonly bannerCacheMisses:number;
}

export interface EngineExpectedScorer {
  evaluate(state:EngineState):number;
  getDiagnostics():EngineExpectedScorerDiagnostics;
}

/**
 * Expected-score terminal evaluator for compact DP states.
 *
 * The scoring model remains unchanged: it uses the same cached role/prefix frontiers as
 * evaluateBoardExpectedFast. The difference is identity and materialization. Each role-local
 * BannerStateID is decoded once per search instead of materializing every reachable three-role
 * BoardState combination at the descriptive boundary.
 *
 * Terminal composition is intentionally stored as a dense prefix-aligned vector. Deep search
 * calls this scalar evaluator millions of times; avoiding repeated linear prefix lookups keeps
 * that exact composition cost proportional to the number of title prefixes rather than its
 * square while preserving the descriptive scorer's incomplete-frontier fallback.
 */
export function createEngineExpectedScorer(
  context:BoardAdapterContext,
  data:DataBundle,
  iterations=data.simulation.optimizerIterations,
):EngineExpectedScorer {
  const prefixCount=data.titles.prefixes.length;
  const prefixIndex=new Map(data.titles.prefixes.map((prefix,index)=>[prefix.id,index] as const));
  const frontierMemo:Record<Role,Map<BannerStateID,RoleFrontierVector>>={
    core:new Map(),mid:new Map(),support:new Map(),
  };
  const bannerMemo:Record<Role,Map<BannerStateID,BannerState>>={
    core:new Map(),mid:new Map(),support:new Map(),
  };
  let bannerMaterializations=0,bannerCacheHits=0,bannerCacheMisses=0;

  const bannerFor=(role:Role,id:BannerStateID):BannerState=>{
    const prior=bannerMemo[role].get(id);if(prior)return prior;
    const banner=decodeBannerState(role,id,context[role]);
    bannerMemo[role].set(id,banner);bannerMaterializations++;
    return banner;
  };

  const vectorizeFrontier=(frontier:RoleFrontier):RoleFrontierVector=>{
    const values=new Float64Array(prefixCount);values.fill(Number.NaN);
    for(const entry of frontier){
      const index=prefixIndex.get(entry.prefixId);
      if(index!==undefined)values[index]=entry.adjustedExpected;
    }
    return values;
  };

  const frontierFor=(role:Role,id:BannerStateID):RoleFrontierVector=>{
    const prior=frontierMemo[role].get(id);
    if(prior){bannerCacheHits++;return prior;}
    bannerCacheMisses++;
    const frontier=vectorizeFrontier(rolePrefixFrontier(role,bannerFor(role,id),data,iterations));
    frontierMemo[role].set(id,frontier);
    return frontier;
  };

  const evaluate=(state:EngineState):number=>{
    const core=frontierFor('core',state.core);
    const mid=frontierFor('mid',state.mid);
    const support=frontierFor('support',state.support);
    let best=-Infinity;
    for(let index=0;index<prefixCount;index++){
      const coreValue=core[index]!,midValue=mid[index]!,supportValue=support[index]!;
      if(!Number.isFinite(coreValue)||!Number.isFinite(midValue)||!Number.isFinite(supportValue))continue;
      const total=coreValue+midValue+supportValue;
      if(total>best)best=total;
    }
    if(Number.isFinite(best))return best;

    // Preserve evaluateBoardExpectedFast's no-prefix/incomplete-frontier fallback exactly.
    const board:BoardState={
      core:bannerFor('core',state.core),
      mid:bannerFor('mid',state.mid),
      support:bannerFor('support',state.support),
    };
    return ROLES.reduce((sum,role)=>sum+(rankTeamsForRole(role,board,data,iterations)[0]?.expected??0),0);
  };

  return {
    evaluate,
    getDiagnostics:()=>({
      bannerMaterializations,
      bannerCacheEntries:ROLES.reduce((sum,role)=>sum+frontierMemo[role].size,0),
      bannerCacheHits,
      bannerCacheMisses,
    }),
  };
}
