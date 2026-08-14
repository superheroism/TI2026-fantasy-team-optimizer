import type { BannerState, BoardState, DataBundle, Role } from '../domain/types.js';
import { evaluateBoardTargetProbabilityFastUncached } from './targetProbability.js';
import { decodeBannerState } from './stateEncoding.js';
import type { BannerStateID, BoardAdapterContext, EngineState } from './stateEncoding.js';

const ROLES: readonly Role[]=['core','mid','support'];

export interface EngineTargetScorerDiagnostics {
  readonly bannerMaterializations:number;
  readonly bannerCacheEntries:number;
  readonly bannerCacheHits:number;
  readonly bannerCacheMisses:number;
}

export interface EngineTargetScorer {
  evaluate(state:EngineState):number;
  getDiagnostics():EngineTargetScorerDiagnostics;
}

/**
 * Exact target-probability terminal evaluator for compact DP states.
 *
 * The target-search objective and generic combinatorial kernel are unchanged. The optimizer already
 * memoizes terminal utility by BoardStateID, so this boundary only avoids rebuilding all three
 * descriptive banners and retaining a second whole-board target-choice cache for every terminal
 * state. Each distinct role-local BannerStateID is decoded once and reused across structurally
 * shared boards; the Dota-facing target scorer still performs the same roster/title search.
 */
export function createEngineTargetScorer(
  context:BoardAdapterContext,
  data:DataBundle,
  targetScore:number,
  iterations=data.simulation.optimizerIterations,
):EngineTargetScorer {
  const bannerMemo:Record<Role,Map<BannerStateID,BannerState>>={
    core:new Map(),mid:new Map(),support:new Map(),
  };
  let bannerMaterializations=0,bannerCacheHits=0,bannerCacheMisses=0;

  const bannerFor=(role:Role,id:BannerStateID):BannerState=>{
    const prior=bannerMemo[role].get(id);
    if(prior){bannerCacheHits++;return prior;}
    bannerCacheMisses++;
    const banner=decodeBannerState(role,id,context[role]);
    bannerMemo[role].set(id,banner);bannerMaterializations++;
    return banner;
  };

  const evaluate=(state:EngineState):number=>{
    const board:BoardState={
      core:bannerFor('core',state.core),
      mid:bannerFor('mid',state.mid),
      support:bannerFor('support',state.support),
    };
    return evaluateBoardTargetProbabilityFastUncached(board,data,targetScore,iterations);
  };

  return {
    evaluate,
    getDiagnostics:()=>({
      bannerMaterializations,
      bannerCacheEntries:ROLES.reduce((sum,role)=>sum+bannerMemo[role].size,0),
      bannerCacheHits,
      bannerCacheMisses,
    }),
  };
}
