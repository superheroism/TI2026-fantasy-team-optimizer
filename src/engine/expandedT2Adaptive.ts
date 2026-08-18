import type { ActionEvaluation, DataBundle, Objective, OptimizerState, RecommendationResult } from '../domain/types.js';
import { evaluateBoard } from './scoring.js';
import { evaluateBoardTarget } from './targetProbability.js';
import { createTerminalSearchRuntime } from './optimizerTerminal.js';
import { createContinuationRuntime } from './optimizerContinuation.js';
import { OPTIMIZER_ROLES, weightedQuantile } from './optimizerHelpers.js';
import type { OptimizerEngineDiagnostics, ExpandedT2AdaptiveDiagnostics } from './optimizerTypes.js';
import type { ExpandedT2AdaptivePolicy } from './expandedT2AdaptivePolicy.js';

interface ScreenedRoot {
  readonly operation:OptimizerState['menu'][number];
  readonly role:(typeof OPTIMIZER_ROLES)[number];
  readonly screenUtility:number;
  readonly scoreEv:number;
  readonly pImprove:number;
  readonly worst:number;
  readonly points:{value:number;probability:number}[];
  readonly order:number;
  refined:boolean;
  modeled:{value:number;utilityOutcomes:readonly {value:number;probability:number}[]}|null;
}

interface InternalRow extends ActionEvaluation { readonly order:number; }

function actionKey(action:ActionEvaluation['action']):string {
  return action.kind==='board_action'?`board:${action.operationId}:${action.banner}`:action.kind;
}
function rankRows(rows:readonly InternalRow[]):InternalRow[] {
  return [...rows].sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility||a.order-b.order);
}
function winnerGap(rows:readonly InternalRow[]):number {
  const ranked=rankRows(rows),winner=ranked[0];
  if(!winner)return 0;
  return Math.max(0,winner.expectedFinalUtility-(ranked[1]?.expectedFinalUtility??winner.expectedFinalUtility));
}
function thresholdFor(policy:ExpandedT2AdaptivePolicy,objective:Objective,index:number):number {
  const threshold=objective==='target_probability'?policy.targetProbabilityGapThresholds[index]:policy.expectedScoreGapThresholds[index];
  if(threshold===undefined||!Number.isFinite(threshold)||threshold<0)throw new Error('invalid certified ambiguity threshold');
  return threshold;
}

export function recommendExpandedT2Adaptive(
  state:OptimizerState,
  data:DataBundle,
  uniformStatFallback:boolean,
  policy:ExpandedT2AdaptivePolicy,
):{result:RecommendationResult;diagnostics:OptimizerEngineDiagnostics} {
  if((state.board.layoutId??'legacy_3')!=='expanded_5'||state.tokensRemaining<2||policy.horizon!==2)throw new Error('expanded t2 adaptive routing invariant failed');

  const overrideMenus=data.menuSamples?.filter(menu=>menu.length===3);
  const terminal=createTerminalSearchRuntime(state,data);
  const continuation=createContinuationRuntime(state,data,terminal,uniformStatFallback);
  const {valueFunction,menuModel}=continuation,initialEngine=terminal.initialEngine;
  const current=state.objective==='target_probability'
    ?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations)
    :evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=state.objective==='target_probability'?(current.targetProbability??0):current.expected;
  terminal.seedCurrent(current);valueFunction.seedTerminalUtility(initialEngine,stopUtility);

  let order=0;
  const stopRow:InternalRow={action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,pImprove:0,tokensAfter:state.tokensRemaining,assetAtRisk:'none',confidence:current.confidence,status:'evaluated',note:'Preserves the board; free team-by-role selection is re-optimized.',order:order++};
  const screened:ScreenedRoot[]=[];
  for(const operation of state.menu){
    for(const role of OPTIMIZER_ROLES){
      const outcomes=continuation.transitionsFor(initialEngine,role,operation);if(!outcomes.length)continue;
      let screenUtility=0,scoreEv=0,pImprove=0,worst=Infinity;const points:{value:number;probability:number}[]=[];
      for(const outcome of outcomes){
        const immediateExpected=terminal.expectedScalar(outcome.nextState);
        const immediateUtility=state.objective==='expected_score'?immediateExpected:terminal.targetScalar(outcome.nextState);
        scoreEv+=outcome.probability*immediateExpected;screenUtility+=outcome.probability*immediateUtility;
        points.push({value:immediateUtility,probability:outcome.probability});
        if(immediateUtility>stopUtility)pImprove+=outcome.probability;
        worst=Math.min(worst,immediateExpected);
      }
      screened.push({operation,role,screenUtility,scoreEv,pImprove,worst,points,order:order++,refined:false,modeled:null});
    }
  }
  if(!screened.length)throw new Error('expanded t2 adaptive found no legal board roots');

  const menuRow:InternalRow|undefined=state.menuRerollAvailable?{
    action:{kind:'menu_reroll'},expectedFinalUtility:valueFunction.V(initialEngine,1),expectedFinalScore:current.expected,pImprove:continuation.freshMenuImprovementProbability(initialEngine,1),tokensAfter:state.tokensRemaining-1,
    assetAtRisk:'1 token; board preserved',confidence:current.confidence,status:'evaluated',
    note:menuModel.mode==='known_uniform'?'Expected value derived from average maximum gain from all possible replacement menus.':`Fresh-menu expectation uses ${overrideMenus?.length??0} supplied menu samples.`,order:order++
  }:undefined;
  const screenOrder=[...screened].sort((a,b)=>b.screenUtility-a.screenUtility||a.order-b.order);
  const stageReports:ExpandedT2AdaptiveDiagnostics['stages'][number][]=[];

  const boardRow=(item:ScreenedRoot):InternalRow=>{
    const modeled=item.modeled??{value:item.screenUtility,utilityOutcomes:item.points},points=[...modeled.utilityOutcomes];
    const row:InternalRow={action:{kind:'board_action',operationId:item.operation.id,banner:item.role},expectedFinalUtility:modeled.value,expectedFinalScore:item.scoreEv,pImprove:item.pImprove,tokensAfter:state.tokensRemaining-1,assetAtRisk:`${item.role} banner`,confidence:current.confidence,status:'evaluated',note:'2-token lookahead uses a representative set of probability-weighted outcomes.',order:item.order};
    const p10=weightedQuantile(points,.10),median=weightedQuantile(points,.50),p90=weightedQuantile(points,.90);
    if(p10!==undefined)row.outcomeP10Utility=p10;if(median!==undefined)row.outcomeMedianUtility=median;if(p90!==undefined)row.outcomeP90Utility=p90;
    if(Number.isFinite(item.worst))row.downside=item.worst-current.expected;
    return row;
  };
  const materialize=():InternalRow[]=>menuRow?[stopRow,...screened.map(boardRow),menuRow]:[stopRow,...screened.map(boardRow)];
  const refineThrough=(k:number)=>{for(const item of screenOrder.slice(0,Math.min(k,screenOrder.length))){if(item.refined)continue;item.modeled=continuation.targetedContinuation(initialEngine,item.operation,item.role,2,'current_menu');item.refined=true;}};

  let rows=materialize(),previousWinner=actionKey(rankRows(rows)[0]!.action),finalStage:ExpandedT2AdaptiveDiagnostics['finalStage']='screen',exactFallback=false;
  for(let stageIndex=0;stageIndex<policy.stages.length;stageIndex++){
    const k=policy.stages[stageIndex]!;refineThrough(k);rows=materialize();const ranked=rankRows(rows),winner=actionKey(ranked[0]!.action),gap=winnerGap(rows),threshold=thresholdFor(policy,state.objective,stageIndex),winnerChanged=winner!==previousWinner,ambiguous=gap<=threshold||(policy.winnerChangeIsAmbiguous&&winnerChanged);
    stageReports.push({k,winner,gap,threshold,winnerChanged,ambiguous,refinedBoardActions:screened.filter(x=>x.refined).length});finalStage=`k${k}` as ExpandedT2AdaptiveDiagnostics['finalStage'];previousWinner=winner;
    if(!ambiguous)break;
    if(stageIndex===policy.stages.length-1){
      if(!policy.exactFallback)throw new Error('certified policy disabled exact fallback');
      for(const item of screenOrder){if(item.refined)continue;item.modeled=continuation.targetedContinuation(initialEngine,item.operation,item.role,2,'current_menu');item.refined=true;}
      rows=materialize();exactFallback=true;finalStage='exact';const exactRanked=rankRows(rows),exactWinner=actionKey(exactRanked[0]!.action),exactGap=winnerGap(rows);
      stageReports.push({k:'all',winner:exactWinner,gap:exactGap,threshold:null,winnerChanged:exactWinner!==previousWinner,ambiguous:false,refinedBoardActions:screened.length});
    }
  }

  const ranking=rankRows(rows).map(({order:_,...row})=>row),terminalDiagnostics=terminal.diagnostics(),continuationDiagnostics=continuation.diagnostics();
  const adaptiveRefinement:ExpandedT2AdaptiveDiagnostics={policyId:policy.id,rootBoardActionsScreened:screened.length,rootBoardActionsRefined:screened.filter(x=>x.refined).length,rootBoardActionsSkipped:screened.filter(x=>!x.refined).length,finalStage,exactFallback,stages:stageReports};
  const diagnostics:OptimizerEngineDiagnostics={searchMode:exactFallback?'expanded_t2_adaptive_exact_fallback':'expanded_t2_adaptive',modeledHorizon:2,...terminalDiagnostics,terminalScoringCalls:terminalDiagnostics.terminalScoringCalls+1,...continuationDiagnostics,valueFunction:valueFunction.getDiagnostics(),menuOperator:menuModel.getDiagnostics(),adaptiveRefinement};
  return {result:{current,ranking,recommendation:ranking[0]!,futureMenuMode:menuModel.mode},diagnostics};
}
