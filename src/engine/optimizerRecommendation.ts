import type { ActionEvaluation, DataBundle, OptimizerState, RecommendationResult } from '../domain/types.js';
import { TOTAL_UNIFORM_MENUS } from '../data/actionCatalog.js';
import { evaluateBoard } from './scoring.js';
import { evaluateBoardTarget } from './targetProbability.js';
import { createTerminalSearchRuntime } from './optimizerTerminal.js';
import { createContinuationRuntime } from './optimizerContinuation.js';
import { formatAction, OPTIMIZER_ROLES, weightedQuantile } from './optimizerHelpers.js';
import type { OptimizerEngineDiagnostics, OptimizerSearchOptions } from './optimizerTypes.js';
import { CERTIFIED_EXPANDED_T2_POLICY, isCertifiedExpandedT2PolicyValid } from './expandedT2AdaptivePolicy.js';
import { recommendExpandedT2Adaptive } from './expandedT2Adaptive.js';

export { formatAction } from './optimizerHelpers.js';
export type { OptimizerEngineDiagnostics, OptimizerSearchOptions } from './optimizerTypes.js';

let lastDiagnostics:OptimizerEngineDiagnostics|undefined;

function zeroDiagnostics():OptimizerEngineDiagnostics {
  return {
    searchMode:'exact',modeledHorizon:0,descriptiveBoardMaterializations:0,descriptiveBoardCacheEntries:0,
    expectedScalarStates:0,targetScalarStates:0,terminalScoringCalls:0,expectedScoringMs:0,targetScoringMs:0,
    expectedBannerMaterializations:0,expectedBannerCacheEntries:0,expectedBannerCacheHits:0,expectedBannerCacheMisses:0,
    targetBannerMaterializations:0,targetBannerCacheEntries:0,targetBannerCacheHits:0,targetBannerCacheMisses:0,
    targetedActionCacheHits:0,targetedActionCacheMisses:0,targetedActionCacheBypasses:0,targetedActionEntries:0,
    targetedActionRequestsByDepth:{},targetedActionCacheHitsByDepth:{},targetedActionCacheMissesByDepth:{},targetedActionCacheBypassesByDepth:{},
    transitionDistributionCacheHits:0,transitionDistributionCacheMisses:0,transitionDistributionCacheBypasses:0,
    transitionDistributionEntries:0,transitionEvaluationsByDepth:{},transitionOutcomesBeforeCompressionByDepth:{},transitionOutcomesAfterCompressionByDepth:{},
    continuationFidelity:{id:'current',description:'',freshMenuOutcomeStrataByDepth:[],baseFreshMenuOutcomeStrata:0,rootContinuationEntryStrata:0},
    actionWidening:{enabled:false,policyId:'none',description:'Action widening disabled.',deepOperationCapsByDepth:[],byDepth:[],freshMenuStatesWidened:0,legalOperationEvaluations:0,shallowOperationEvaluations:0,recursivelyDeepenedOperationEvaluations:0,operationEvaluationsAvoided:0,wideningAvoidanceRate:0},
    valueFunction:{terminalCacheHits:0,terminalCacheMisses:0,vCalls:0,vCacheHits:0,vCacheMisses:0,qCalls:0,qCacheHits:0,qCacheMisses:0,
      actionCalls:0,actionCacheHits:0,actionCacheMisses:0,actionCacheBypasses:0,uniqueStatesByDepth:{},uniqueQStatesByDepth:{},uniqueActionStatesByDepth:{},
      vCallsByDepth:{},vCacheHitsByDepth:{},vCacheMissesByDepth:{},qCallsByDepth:{},qCacheHitsByDepth:{},qCacheMissesByDepth:{},
      actionCallsByDepth:{},actionCacheHitsByDepth:{},actionCacheMissesByDepth:{},actionCacheBypassesByDepth:{},actionEvaluationsByDepth:{},
      terminalEntries:0,vEntries:0,qEntries:0,actionEntries:0,elapsedMs:0},
    menuOperator:{calls:0,uniformCalls:0,overrideCalls:0,explicitMenusScanned:0,operatorMs:0},
  };
}

export function getLastOptimizerEngineDiagnostics():OptimizerEngineDiagnostics {
  return structuredClone(lastDiagnostics??zeroDiagnostics());
}

export function recommendNextAction(
  state:OptimizerState,
  data:DataBundle,
  uniformStatFallback=true,
  searchOptions:OptimizerSearchOptions={},
):RecommendationResult {
  const productionHorizon=Math.max(1,Math.min(data.simulation.maxLookaheadTokens??2,2));
  const requestedHorizon=searchOptions.modeledHorizonOverride===undefined
    ?productionHorizon
    :Math.max(1,Math.floor(searchOptions.modeledHorizonOverride));
  const horizon=Math.max(1,Math.min(state.tokensRemaining,requestedHorizon));
  const layoutId=state.board.layoutId??'legacy_3';
  let adaptiveFallbackReason:string|undefined;

  // Production defaults route expanded_5 t=2 through the M6D-certified policy.
  // Any explicit engineering horizon override preserves the historical exact-oracle path.
  if(layoutId==='expanded_5'&&horizon===2&&searchOptions.modeledHorizonOverride===undefined&&!searchOptions.engineeringForceExact){
    if(isCertifiedExpandedT2PolicyValid(CERTIFIED_EXPANDED_T2_POLICY)){
      try{
        const adaptive=recommendExpandedT2Adaptive(state,data,uniformStatFallback,CERTIFIED_EXPANDED_T2_POLICY);
        lastDiagnostics=adaptive.diagnostics;
        return adaptive.result;
      }catch(error){
        adaptiveFallbackReason=error instanceof Error?error.message:'unknown expanded t2 adaptive integration failure';
      }
    }else adaptiveFallbackReason='invalid M6D certified adaptive-tight policy configuration';
  }

  const continuationStrata=Math.max(1,data.simulation.continuationOutcomeStrata??8);
  const continuationEntryStrata=Math.max(1,data.simulation.continuationEntryStrata??12);
  const overrideMenus=data.menuSamples?.filter(menu=>menu.length===3);

  const terminal=createTerminalSearchRuntime(state,data);
  const experimentalFidelity=horizon>2&&searchOptions.experimentalContinuationFidelity
    ?{modeledHorizon:horizon,policy:searchOptions.experimentalContinuationFidelity}
    :undefined;
  const experimentalWidening=horizon>2&&searchOptions.experimentalActionWidening
    ?{modeledHorizon:horizon,policy:searchOptions.experimentalActionWidening}
    :undefined;
  const continuation=createContinuationRuntime(state,data,terminal,uniformStatFallback,experimentalFidelity,experimentalWidening);
  const {valueFunction,menuModel}=continuation;
  const initialEngine=terminal.initialEngine;

  const current=state.objective==='target_probability'
    ?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations)
    :evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=state.objective==='target_probability'?(current.targetProbability??0):current.expected;
  terminal.seedCurrent(current);
  valueFunction.seedTerminalUtility(initialEngine,stopUtility);

  const rows:ActionEvaluation[]=[{
    action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,
    tokensAfter:state.tokensRemaining,assetAtRisk:'none',confidence:current.confidence,status:'evaluated',
    note:'Preserves the board; free team-by-role selection is re-optimized.',
  }];

  if(state.tokensRemaining>0){
    for(const operation of state.menu){
      for(const role of OPTIMIZER_ROLES){
        const outcomes=continuation.transitionsFor(initialEngine,role,operation);if(!outcomes.length)continue;
        let scoreEv=0,pImprove=0,worst=Infinity;
        for(const outcome of outcomes){
          const immediateExpected=terminal.expectedScalar(outcome.nextState);
          const immediateUtility=state.objective==='expected_score'?immediateExpected:terminal.targetScalar(outcome.nextState);
          scoreEv+=outcome.probability*immediateExpected;
          if(immediateUtility>stopUtility)pImprove+=outcome.probability;
          worst=Math.min(worst,immediateExpected);
        }

        const modeled=continuation.targetedContinuation(initialEngine,operation,role,horizon,'current_menu');
        const points=[...modeled.utilityOutcomes];
        const p10=weightedQuantile(points,.10),median=weightedQuantile(points,.50),p90=weightedQuantile(points,.90);
        const row:ActionEvaluation={
          action:{kind:'board_action',operationId:operation.id,banner:role},
          expectedFinalUtility:modeled.value,expectedFinalScore:scoreEv,pImprove,
          tokensAfter:state.tokensRemaining-1,assetAtRisk:`${role} banner`,confidence:current.confidence,status:'evaluated',
        };
        if(p10!==undefined)row.outcomeP10Utility=p10;
        if(median!==undefined)row.outcomeMedianUtility=median;
        if(p90!==undefined)row.outcomeP90Utility=p90;
        if(Number.isFinite(worst))row.downside=worst-current.expected;
        if(state.tokensRemaining>horizon)row.note=`Decision lookahead capped at ${horizon} tokens for browser performance.`;
        else if(horizon>1)row.note=`${horizon}-token continuation uses deterministic probability stratification (${continuationEntryStrata} entry / ${continuationStrata} fresh-menu strata max).`;
        rows.push(row);
      }
    }

    const nextTokens=state.tokensRemaining-1;
    if(nextTokens===0){
      rows.push({action:{kind:'menu_reroll'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,tokensAfter:0,
        assetAtRisk:'last token; board preserved',confidence:current.confidence,status:'evaluated',
        note:'Fresh menu cannot be acted on with 0 tokens remaining.'});
    }else{
      const ev=valueFunction.V(initialEngine,Math.max(0,horizon-1));
      rows.push({action:{kind:'menu_reroll'},expectedFinalUtility:ev,expectedFinalScore:current.expected,tokensAfter:nextTokens,
        assetAtRisk:'1 token; board preserved',confidence:current.confidence,status:'evaluated',
        note:menuModel.mode==='known_uniform'
          ?`Fresh menu is a uniform draw of 3 distinct actions from 20; expectation uses the exact combinatorial operator equivalent to ${TOTAL_UNIFORM_MENUS.toLocaleString()} menus.`
          :`Fresh-menu expectation uses ${overrideMenus?.length??0} supplied menu samples.`});
    }
  }

  if(state.tokensRemaining>0)valueFunction.Q(initialEngine,state.menu,horizon);
  const ranking=rows.sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility);
  const terminalDiagnostics=terminal.diagnostics(),continuationDiagnostics=continuation.diagnostics();
  lastDiagnostics={
    searchMode:adaptiveFallbackReason?'expanded_t2_exact_fallback':'exact',
    modeledHorizon:horizon,
    ...terminalDiagnostics,
    terminalScoringCalls:terminalDiagnostics.terminalScoringCalls+1,
    ...continuationDiagnostics,
    valueFunction:valueFunction.getDiagnostics(),menuOperator:menuModel.getDiagnostics(),
    ...(adaptiveFallbackReason?{fallbackReason:adaptiveFallbackReason}:{}),
  };
  return {current,ranking,recommendation:ranking[0]!,futureMenuMode:menuModel.mode};
}
