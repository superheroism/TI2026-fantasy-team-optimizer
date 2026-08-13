import type { ActionEvaluation, BoardEvaluation, DataBundle, DecisionAction, OfferedOperation, OptimizerState, RecommendationResult, Role } from '../domain/types.js';
import { evaluateBoard, evaluateBoardExpectedFast } from './scoring.js';
import { evaluateBoardTarget, evaluateBoardTargetProbabilityFast } from './targetProbability.js';
import { enumerateEngineOperation } from './compactTransitions.js';
import type { EngineTransition } from './compactTransitions.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from './stateEncoding.js';
import type { BoardStateID, EngineState } from './stateEncoding.js';
import { ACTION_CATALOG, TOTAL_UNIFORM_MENUS } from '../data/actionCatalog.js';
import { MenuModel } from './menuModel.js';
import type { MenuOperatorDiagnostics } from './menuModel.js';
import { FiniteHorizonValueFunction } from './valueFunction.js';
import type { ValueActionPhase, ValueFunctionDiagnostics } from './valueFunction.js';

const ROLES: readonly Role[] = ['core','mid','support'];

/**
 * Search-only overrides for bounded engineering experiments. Normal application
 * calls omit this object and remain capped at the M4 production horizon of two.
 */
export interface OptimizerSearchOptions {
  readonly modeledHorizonOverride?:number;
}

export interface OptimizerEngineDiagnostics {
  readonly modeledHorizon:number;
  readonly descriptiveBoardMaterializations:number;
  readonly descriptiveBoardCacheEntries:number;
  readonly expectedScalarStates:number;
  readonly targetScalarStates:number;
  readonly terminalScoringCalls:number;
  readonly targetedActionCacheHits:number;
  readonly targetedActionCacheMisses:number;
  readonly targetedActionEntries:number;
  readonly targetedActionRequestsByDepth:Readonly<Record<string,number>>;
  readonly targetedActionCacheHitsByDepth:Readonly<Record<string,number>>;
  readonly targetedActionCacheMissesByDepth:Readonly<Record<string,number>>;
  readonly transitionDistributionCacheHits:number;
  readonly transitionDistributionCacheMisses:number;
  readonly transitionDistributionEntries:number;
  readonly transitionEvaluationsByDepth:Readonly<Record<string,number>>;
  readonly valueFunction:ValueFunctionDiagnostics;
  readonly menuOperator:MenuOperatorDiagnostics;
}

const EMPTY_VALUE_DIAGNOSTICS:ValueFunctionDiagnostics={
  terminalCacheHits:0,terminalCacheMisses:0,
  vCalls:0,vCacheHits:0,vCacheMisses:0,qCalls:0,qCacheHits:0,qCacheMisses:0,
  actionCalls:0,actionCacheHits:0,actionCacheMisses:0,
  uniqueStatesByDepth:{},uniqueQStatesByDepth:{},uniqueActionStatesByDepth:{},
  vCallsByDepth:{},vCacheHitsByDepth:{},vCacheMissesByDepth:{},
  qCallsByDepth:{},qCacheHitsByDepth:{},qCacheMissesByDepth:{},
  actionCallsByDepth:{},actionCacheHitsByDepth:{},actionCacheMissesByDepth:{},actionEvaluationsByDepth:{},
  terminalEntries:0,vEntries:0,qEntries:0,actionEntries:0,elapsedMs:0,
};
const EMPTY_MENU_DIAGNOSTICS:MenuOperatorDiagnostics={calls:0,uniformCalls:0,overrideCalls:0,explicitMenusScanned:0,operatorMs:0};
let lastEngineDiagnostics:OptimizerEngineDiagnostics={
  modeledHorizon:0,descriptiveBoardMaterializations:0,descriptiveBoardCacheEntries:0,
  expectedScalarStates:0,targetScalarStates:0,terminalScoringCalls:0,
  targetedActionCacheHits:0,targetedActionCacheMisses:0,targetedActionEntries:0,
  targetedActionRequestsByDepth:{},targetedActionCacheHitsByDepth:{},targetedActionCacheMissesByDepth:{},
  transitionDistributionCacheHits:0,transitionDistributionCacheMisses:0,transitionDistributionEntries:0,
  transitionEvaluationsByDepth:{},valueFunction:EMPTY_VALUE_DIAGNOSTICS,menuOperator:EMPTY_MENU_DIAGNOSTICS,
};
export function getLastOptimizerEngineDiagnostics():OptimizerEngineDiagnostics {
  return {
    ...lastEngineDiagnostics,
    transitionEvaluationsByDepth:{...lastEngineDiagnostics.transitionEvaluationsByDepth},
    targetedActionRequestsByDepth:{...lastEngineDiagnostics.targetedActionRequestsByDepth},
    targetedActionCacheHitsByDepth:{...lastEngineDiagnostics.targetedActionCacheHitsByDepth},
    targetedActionCacheMissesByDepth:{...lastEngineDiagnostics.targetedActionCacheMissesByDepth},
    valueFunction:{
      ...lastEngineDiagnostics.valueFunction,
      uniqueStatesByDepth:{...lastEngineDiagnostics.valueFunction.uniqueStatesByDepth},
      uniqueQStatesByDepth:{...lastEngineDiagnostics.valueFunction.uniqueQStatesByDepth},
      uniqueActionStatesByDepth:{...lastEngineDiagnostics.valueFunction.uniqueActionStatesByDepth},
      vCallsByDepth:{...lastEngineDiagnostics.valueFunction.vCallsByDepth},
      vCacheHitsByDepth:{...lastEngineDiagnostics.valueFunction.vCacheHitsByDepth},
      vCacheMissesByDepth:{...lastEngineDiagnostics.valueFunction.vCacheMissesByDepth},
      qCallsByDepth:{...lastEngineDiagnostics.valueFunction.qCallsByDepth},
      qCacheHitsByDepth:{...lastEngineDiagnostics.valueFunction.qCacheHitsByDepth},
      qCacheMissesByDepth:{...lastEngineDiagnostics.valueFunction.qCacheMissesByDepth},
      actionCallsByDepth:{...lastEngineDiagnostics.valueFunction.actionCallsByDepth},
      actionCacheHitsByDepth:{...lastEngineDiagnostics.valueFunction.actionCacheHitsByDepth},
      actionCacheMissesByDepth:{...lastEngineDiagnostics.valueFunction.actionCacheMissesByDepth},
      actionEvaluationsByDepth:{...lastEngineDiagnostics.valueFunction.actionEvaluationsByDepth},
    },
    menuOperator:{...lastEngineDiagnostics.menuOperator},
  };
}

function incrementDepth(map:Map<number,number>,depth:number):void {
  map.set(depth,(map.get(depth)??0)+1);
}
function depthRecord(map:ReadonlyMap<number,number>):Record<string,number> {
  const result:Record<string,number>={};
  for(const [depth,count] of map)result[String(depth)]=count;
  return result;
}

function utility(evaluation:BoardEvaluation,state:OptimizerState):number {
  return state.objective==='target_probability'?(evaluation.targetProbability??0):evaluation.expected;
}

export function formatAction(action:DecisionAction,state?:OptimizerState):string {
  if(action.kind==='stop')return 'Best Current Setup';
  if(action.kind==='menu_reroll')return 'Reroll operation menu';
  const label=state?.menu.find(o=>o.id===action.operationId)?.label??action.operationId;
  return `${action.banner.toUpperCase()} → ${label}`;
}

function weightedQuantile(points:{value:number;probability:number}[],q:number):number|undefined{
  const clean=points.filter(x=>Number.isFinite(x.value)&&x.probability>0).sort((a,b)=>a.value-b.value);
  const total=clean.reduce((sum,x)=>sum+x.probability,0);if(total<=0)return undefined;
  const target=Math.max(0,Math.min(1,q))*total;let cumulative=0;
  for(const x of clean){cumulative+=x.probability;if(cumulative>=target)return x.value;}
  return clean.at(-1)?.value;
}

/** Deterministic probability-strata compression retained from the pre-DP two-step policy. */
function stratifiedTransitions(outcomes:readonly EngineTransition[],maxStrata:number):EngineTransition[]{
  if(maxStrata<=0||outcomes.length<=maxStrata)return [...outcomes];
  const total=outcomes.reduce((s,x)=>s+x.probability,0);if(total<=0)return [];
  const normalized=outcomes.map(x=>({...x,probability:x.probability/total}));
  const selected:EngineTransition[]=[];let cumulative=0,index=0;
  for(let stratum=0;stratum<maxStrata;stratum++){
    const target=(stratum+0.5)/maxStrata;
    while(index<normalized.length-1&&cumulative+normalized[index]!.probability<target){cumulative+=normalized[index]!.probability;index++;}
    const chosen=normalized[index]!;
    selected.push({...chosen,probability:1/maxStrata});
  }
  const grouped=new Map<BoardStateID,{nextState:EngineState;probability:number;note?:string}>();
  for(const x of selected){const key=x.nextState.id,prior=grouped.get(key);if(prior)prior.probability+=x.probability;else grouped.set(key,{...x});}
  return [...grouped.values()];
}

interface TargetedContinuation {
  readonly value:number;
  readonly utilityOutcomes:readonly {value:number;probability:number}[];
}

/**
 * M4 value-function semantics with an opt-in experimental horizon override.
 * Production calls remain capped at two modeled token spends; M5A benchmarks
 * can exercise the same V/Q architecture at deeper finite horizons.
 */
export function recommendNextAction(
  state:OptimizerState,
  data:DataBundle,
  uniformStatFallback=true,
  searchOptions:OptimizerSearchOptions={},
):RecommendationResult {
  const overrideMenus=data.menuSamples?.filter(menu=>menu.length===3);
  const menuModel=new MenuModel(overrideMenus?.length?overrideMenus:undefined);
  const productionHorizon=Math.max(1,Math.min(data.simulation.maxLookaheadTokens??2,2));
  const requestedHorizon=searchOptions.modeledHorizonOverride===undefined
    ?productionHorizon
    :Math.max(1,Math.floor(searchOptions.modeledHorizonOverride));
  const horizon=Math.max(1,Math.min(state.tokensRemaining,requestedHorizon));
  const continuationStrata=Math.max(1,data.simulation.continuationOutcomeStrata??8);
  const continuationEntryStrata=Math.max(1,data.simulation.continuationEntryStrata??12);

  const context=boardAdapterContext(state.board);
  const initialEngine=boardToEngineState(state.board);
  const boardMemo=new Map<BoardStateID,OptimizerState['board']>([[initialEngine.id,state.board]]);
  let descriptiveBoardMaterializations=0;
  const boardFor=(engine:EngineState):OptimizerState['board']=>{
    const prior=boardMemo.get(engine.id);if(prior)return prior;
    const board=engineStateToBoard(engine,context);boardMemo.set(engine.id,board);descriptiveBoardMaterializations++;return board;
  };

  const scalarMemo=new Map<BoardStateID,number>();
  const targetMemo=new Map<BoardStateID,number>();
  let terminalScoringCalls=0;
  const expectedScalar=(engine:EngineState):number=>{
    const prior=scalarMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=evaluateBoardExpectedFast(boardFor(engine),data,data.simulation.optimizerIterations);scalarMemo.set(engine.id,value);return value;
  };
  const targetScalar=(engine:EngineState):number=>{
    const prior=targetMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=evaluateBoardTargetProbabilityFast(boardFor(engine),data,state.targetScore??0,data.simulation.optimizerIterations);targetMemo.set(engine.id,value);return value;
  };
  const searchUtility=(engine:EngineState):number=>state.objective==='expected_score'?expectedScalar(engine):targetScalar(engine);

  const transitionMemo=new Map<string,readonly EngineTransition[]>();
  let transitionDistributionCacheHits=0,transitionDistributionCacheMisses=0;
  const transitionsFor=(engine:EngineState,role:Role,operation:OfferedOperation):readonly EngineTransition[]=>{
    const key=`${engine.id}|${role}|${operation.id}`;
    const prior=transitionMemo.get(key);if(prior){transitionDistributionCacheHits++;return prior;}
    transitionDistributionCacheMisses++;
    const outcomes=enumerateEngineOperation(engine,role,operation,uniformStatFallback);
    transitionMemo.set(key,outcomes);return outcomes;
  };

  const targetedMemo=new Map<string,TargetedContinuation>();
  let targetedActionCacheHits=0,targetedActionCacheMisses=0;
  const targetedActionRequestsByDepth=new Map<number,number>();
  const targetedActionCacheHitsByDepth=new Map<number,number>();
  const targetedActionCacheMissesByDepth=new Map<number,number>();
  const transitionEvaluationsByDepth=new Map<number,number>();
  let valueFunction:FiniteHorizonValueFunction<EngineState,OfferedOperation,OptimizerState['menu']>;

  const targetedContinuation=(
    engine:EngineState,
    operation:OfferedOperation,
    role:Role,
    tokensRemaining:number,
    phase:ValueActionPhase,
  ):TargetedContinuation=>{
    incrementDepth(targetedActionRequestsByDepth,tokensRemaining);
    const key=`${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}`;
    const prior=targetedMemo.get(key);
    if(prior){targetedActionCacheHits++;incrementDepth(targetedActionCacheHitsByDepth,tokensRemaining);return prior;}
    targetedActionCacheMisses++;incrementDepth(targetedActionCacheMissesByDepth,tokensRemaining);
    incrementDepth(transitionEvaluationsByDepth,tokensRemaining);
    const exact=transitionsFor(engine,role,operation);
    if(!exact.length){const empty={value:-Infinity,utilityOutcomes:[]};targetedMemo.set(key,empty);return empty;}

    // Preserve M4 fidelity asymmetry exactly at every recursive depth:
    // - visible immediate metrics: complete distribution (below);
    // - first visible action entering continuation: continuationEntryStrata;
    // - actions reached through any fresh menu: continuationOutcomeStrata.
    const modeled=phase==='fresh_menu'
      ?stratifiedTransitions(exact,continuationStrata)
      :(tokensRemaining>1?stratifiedTransitions(exact,continuationEntryStrata):[...exact]);
    let value=0;
    const utilityOutcomes:{value:number;probability:number}[]=[];
    for(const outcome of modeled){
      const continuation=valueFunction.V(outcome.nextState,tokensRemaining-1);
      value+=outcome.probability*continuation;
      utilityOutcomes.push({value:continuation,probability:outcome.probability});
    }
    const result={value,utilityOutcomes};targetedMemo.set(key,result);return result;
  };

  valueFunction=new FiniteHorizonValueFunction({
    stateId:(engine:EngineState)=>engine.id,
    operationId:(operation:OfferedOperation)=>operation.id,
    allOperations:ACTION_CATALOG,
    menuOperations:(menu:OptimizerState['menu'])=>menu,
    menuId:(menu:OptimizerState['menu'])=>menu.map(operation=>operation.id).sort().join(','),
    terminalUtility:searchUtility,
    actionValue:(engine,operation,tokensRemaining,phase)=>{
      let best=-Infinity;
      for(const role of ROLES)best=Math.max(best,targetedContinuation(engine,operation,role,tokensRemaining,phase).value);
      return best;
    },
    freshMenuExpectedUtility:(_engine,_tokensRemaining,baseline,operationValues)=>
      menuModel.expectedFreshMenuUtility(operationValues,baseline),
  });

  terminalScoringCalls++;
  const current=state.objective==='target_probability'
    ?evaluateBoardTarget(state.board,state.username,data,state.targetScore??0,data.simulation.optimizerIterations)
    :evaluateBoard(state.board,state.username,data,state.targetScore);
  const stopUtility=utility(current,state);
  // Seed both the objective scalar and V/Q terminal memo with the full current evaluation.
  if(state.objective==='expected_score')scalarMemo.set(initialEngine.id,current.expected);
  else if(current.targetProbability!==undefined)targetMemo.set(initialEngine.id,current.targetProbability);
  valueFunction.seedTerminalUtility(initialEngine,stopUtility);

  const rows:ActionEvaluation[]=[{
    action:{kind:'stop'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,
    tokensAfter:state.tokensRemaining,assetAtRisk:'none',confidence:current.confidence,status:'evaluated',
    note:'Preserves the board; free team-by-role selection is re-optimized.',
  }];

  if(state.tokensRemaining>0){
    for(const operation of state.menu){
      for(const role of ROLES){
        const outcomes=transitionsFor(initialEngine,role,operation);if(!outcomes.length)continue;
        let scoreEv=0,pImprove=0,worst=Infinity;
        // User-visible immediate metrics remain full-distribution calculations.
        for(const outcome of outcomes){
          const immediateExpected=expectedScalar(outcome.nextState);
          const immediateUtility=state.objective==='expected_score'?immediateExpected:targetScalar(outcome.nextState);
          scoreEv+=outcome.probability*immediateExpected;
          if(immediateUtility>stopUtility)pImprove+=outcome.probability;
          worst=Math.min(worst,immediateExpected);
        }

        const continuation=targetedContinuation(initialEngine,operation,role,horizon,'current_menu');
        const points=[...continuation.utilityOutcomes];
        const p10=weightedQuantile(points,.10),median=weightedQuantile(points,.50),p90=weightedQuantile(points,.90);
        const row:ActionEvaluation={
          action:{kind:'board_action',operationId:operation.id,banner:role},
          expectedFinalUtility:continuation.value,expectedFinalScore:scoreEv,pImprove,
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
      rows.push({
        action:{kind:'menu_reroll'},expectedFinalUtility:stopUtility,expectedFinalScore:current.expected,tokensAfter:0,
        assetAtRisk:'last token; board preserved',confidence:current.confidence,status:'evaluated',
        note:'Fresh menu cannot be acted on with 0 tokens remaining.',
      });
    } else {
      // A current-menu reroll consumes exactly one modeled spend. In production
      // horizon=2 this is the M4 V(B,1) path; experimental h=3/4 naturally uses
      // V(B,2/3) without changing the value-function semantics.
      const ev=valueFunction.V(initialEngine,Math.max(0,horizon-1));
      rows.push({
        action:{kind:'menu_reroll'},expectedFinalUtility:ev,expectedFinalScore:current.expected,tokensAfter:nextTokens,
        assetAtRisk:'1 token; board preserved',confidence:current.confidence,status:'evaluated',
        note:menuModel.mode==='known_uniform'
          ?`Fresh menu is a uniform draw of 3 distinct actions from 20; expectation uses the exact combinatorial operator equivalent to ${TOTAL_UNIFORM_MENUS.toLocaleString()} menus.`
          :`Fresh-menu expectation uses ${overrideMenus?.length??0} supplied menu samples.`,
      });
    }
  }

  // Exercise/cache the canonical current-menu Q object. The ranked rows remain
  // descriptive because they retain per-target immediate metrics and quantiles.
  if(state.tokensRemaining>0)valueFunction.Q(initialEngine,state.menu,horizon);

  const ranking=rows.sort((a,b)=>b.expectedFinalUtility-a.expectedFinalUtility);
  lastEngineDiagnostics={
    modeledHorizon:horizon,
    descriptiveBoardMaterializations,
    descriptiveBoardCacheEntries:boardMemo.size,
    expectedScalarStates:scalarMemo.size,
    targetScalarStates:targetMemo.size,
    terminalScoringCalls,
    targetedActionCacheHits,
    targetedActionCacheMisses,
    targetedActionEntries:targetedMemo.size,
    targetedActionRequestsByDepth:depthRecord(targetedActionRequestsByDepth),
    targetedActionCacheHitsByDepth:depthRecord(targetedActionCacheHitsByDepth),
    targetedActionCacheMissesByDepth:depthRecord(targetedActionCacheMissesByDepth),
    transitionDistributionCacheHits,
    transitionDistributionCacheMisses,
    transitionDistributionEntries:transitionMemo.size,
    transitionEvaluationsByDepth:depthRecord(transitionEvaluationsByDepth),
    valueFunction:valueFunction.getDiagnostics(),
    menuOperator:menuModel.getDiagnostics(),
  };
  return {current,ranking,recommendation:ranking[0]!,futureMenuMode:menuModel.mode};
}
