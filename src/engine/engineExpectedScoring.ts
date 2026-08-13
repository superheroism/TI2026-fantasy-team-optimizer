import type { BannerState, BoardState, DataBundle, Role } from '../domain/types.js';
import { rankTeamsForRole, rolePrefixFrontier } from './scoring.js';
import { decodeBannerState } from './stateEncoding.js';
import type { BannerStateID, BoardAdapterContext, EngineState } from './stateEncoding.js';

const ROLES: readonly Role[]=['core','mid','support'];
type RoleFrontier=ReturnType<typeof rolePrefixFrontier>;

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
 */
export function createEngineExpectedScorer(
  context:BoardAdapterContext,
  data:DataBundle,
  iterations=data.simulation.optimizerIterations,
):EngineExpectedScorer {
  const frontierMemo:Record<Role,Map<BannerStateID,RoleFrontier>>={
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

  const frontierFor=(role:Role,id:BannerStateID):RoleFrontier=>{
    const prior=frontierMemo[role].get(id);
    if(prior){bannerCacheHits++;return prior;}
    bannerCacheMisses++;
    const frontier=rolePrefixFrontier(role,bannerFor(role,id),data,iterations);
    frontierMemo[role].set(id,frontier);
    return frontier;
  };

  const evaluate=(state:EngineState):number=>{
    const frontiers={
      core:frontierFor('core',state.core),
      mid:frontierFor('mid',state.mid),
      support:frontierFor('support',state.support),
    };
    let best=-Infinity;
    for(const prefix of data.titles.prefixes){
      let total=0,complete=true;
      for(const role of ROLES){
        const entry=frontiers[role].find(x=>x.prefixId===prefix.id);
        if(!entry){complete=false;break;}
        total+=entry.adjustedExpected;
      }
      if(complete&&total>best)best=total;
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
