import type { DataBundle, OfferedOperation, OptimizerState, Role } from '../domain/types.js';
import { ACTION_CATALOG } from '../data/actionCatalog.js';
import { enumerateEngineOperation } from './compactTransitions.js';
import type { EngineTransition } from './compactTransitions.js';
import { MenuModel } from './menuModel.js';
import { FiniteHorizonValueFunction } from './valueFunction.js';
import type { ValueActionPhase } from './valueFunction.js';
import type { EngineState } from './stateEncoding.js';
import type { TerminalSearchRuntime } from './optimizerTerminal.js';
import { depthRecord, incrementDepth, OPTIMIZER_ROLES, stratifiedTransitions } from './optimizerHelpers.js';
import {
  CONTINUATION_FIDELITY_PRESETS,
  continuationFidelityReport,
  resolveFreshMenuOutcomeStrata,
} from './continuationFidelity.js';
import type { ContinuationFidelityPolicy, ContinuationFidelityReport } from './continuationFidelity.js';

export interface ExperimentalContinuationFidelityConfig {
  readonly modeledHorizon:number;
  readonly policy:ContinuationFidelityPolicy;
}

export { CONTINUATION_FIDELITY_PRESETS } from './continuationFidelity.js';
export type { ContinuationFidelityPolicy, ContinuationFidelityReport } from './continuationFidelity.js';

export interface TargetedContinuation {
  readonly value:number;
  readonly utilityOutcomes:readonly {value:number;probability:number}[];
}

export interface ContinuationDiagnostics {
  readonly continuationFidelity:ContinuationFidelityReport;
  readonly targetedActionCacheHits:number;
  readonly targetedActionCacheMisses:number;
  readonly targetedActionCacheBypasses:number;
  readonly targetedActionEntries:number;
  readonly targetedActionRequestsByDepth:Readonly<Record<string,number>>;
  readonly targetedActionCacheHitsByDepth:Readonly<Record<string,number>>;
  readonly targetedActionCacheMissesByDepth:Readonly<Record<string,number>>;
  readonly targetedActionCacheBypassesByDepth:Readonly<Record<string,number>>;
  readonly transitionDistributionCacheHits:number;
  readonly transitionDistributionCacheMisses:number;
  readonly transitionDistributionCacheBypasses:number;
  readonly transitionDistributionEntries:number;
  readonly transitionEvaluationsByDepth:Readonly<Record<string,number>>;
  readonly transitionOutcomesBeforeCompressionByDepth:Readonly<Record<string,number>>;
  readonly transitionOutcomesAfterCompressionByDepth:Readonly<Record<string,number>>;
}

export interface ContinuationRuntime {
  readonly valueFunction:FiniteHorizonValueFunction<EngineState,OfferedOperation,OptimizerState['menu']>;
  readonly menuModel:MenuModel;
  transitionsFor(engine:EngineState,role:Role,operation:OfferedOperation):readonly EngineTransition[];
  targetedContinuation(engine:EngineState,operation:OfferedOperation,role:Role,tokensRemaining:number,phase:ValueActionPhase):TargetedContinuation;
  diagnostics():ContinuationDiagnostics;
}

function addDepthTotal(map:Map<number,number>,depth:number,amount:number):void {
  map.set(depth,(map.get(depth)??0)+amount);
}

export function createContinuationRuntime(
  state:OptimizerState,
  data:DataBundle,
  terminal:TerminalSearchRuntime,
  uniformStatFallback:boolean,
  experimentalFidelity?:ExperimentalContinuationFidelityConfig,
):ContinuationRuntime {
  const overrideMenus=data.menuSamples?.filter(menu=>menu.length===3);
  const menuModel=new MenuModel(overrideMenus?.length?overrideMenus:undefined);
  const continuationStrata=Math.max(1,data.simulation.continuationOutcomeStrata??8);
  const continuationEntryStrata=Math.max(1,data.simulation.continuationEntryStrata??12);
  const configured=experimentalFidelity&&experimentalFidelity.modeledHorizon>2
    ?{modeledHorizon:Math.max(3,Math.floor(experimentalFidelity.modeledHorizon)),policy:experimentalFidelity.policy}
    :undefined;
  const fidelityPolicy=configured?.policy??CONTINUATION_FIDELITY_PRESETS.current;
  const fidelity=continuationFidelityReport(fidelityPolicy,continuationStrata,continuationEntryStrata);

  const transitionMemo=new Map<string,readonly EngineTransition[]>();
  let transitionDistributionCacheHits=0,transitionDistributionCacheMisses=0,transitionDistributionCacheBypasses=0;
  const transitionDistribution=(engine:EngineState,role:Role,operation:OfferedOperation,retain:boolean):readonly EngineTransition[]=>{
    if(!retain){
      transitionDistributionCacheBypasses++;
      return enumerateEngineOperation(engine,role,operation,uniformStatFallback);
    }
    const key=`${engine.id}|${role}|${operation.id}`;
    const prior=transitionMemo.get(key);
    if(prior){transitionDistributionCacheHits++;return prior;}
    transitionDistributionCacheMisses++;
    const outcomes=enumerateEngineOperation(engine,role,operation,uniformStatFallback);
    transitionMemo.set(key,outcomes);return outcomes;
  };
  const transitionsFor=(engine:EngineState,role:Role,operation:OfferedOperation)=>transitionDistribution(engine,role,operation,true);

  const targetedMemo=new Map<string,TargetedContinuation>();
  let targetedActionCacheHits=0,targetedActionCacheMisses=0,targetedActionCacheBypasses=0;
  const requestsByDepth=new Map<number,number>(),hitsByDepth=new Map<number,number>();
  const missesByDepth=new Map<number,number>(),bypassesByDepth=new Map<number,number>();
  const transitionEvaluationsByDepth=new Map<number,number>();
  const outcomesBeforeByDepth=new Map<number,number>(),outcomesAfterByDepth=new Map<number,number>();
  let valueFunction:FiniteHorizonValueFunction<EngineState,OfferedOperation,OptimizerState['menu']>;

  const targetedContinuation=(
    engine:EngineState,operation:OfferedOperation,role:Role,tokensRemaining:number,phase:ValueActionPhase,
  ):TargetedContinuation=>{
    incrementDepth(requestsByDepth,tokensRemaining);
    const retain=phase==='current_menu';
    const key=retain?`${engine.id}|${tokensRemaining}|${phase}|${operation.id}|${role}`:'';
    if(retain){
      const prior=targetedMemo.get(key);
      if(prior){targetedActionCacheHits++;incrementDepth(hitsByDepth,tokensRemaining);return prior;}
      targetedActionCacheMisses++;incrementDepth(missesByDepth,tokensRemaining);
    }else{
      targetedActionCacheBypasses++;incrementDepth(bypassesByDepth,tokensRemaining);
    }
    incrementDepth(transitionEvaluationsByDepth,tokensRemaining);
    const exact=transitionDistribution(engine,role,operation,retain);
    if(!exact.length){
      const empty={value:-Infinity,utilityOutcomes:[]};if(retain)targetedMemo.set(key,empty);return empty;
    }

    const recursiveDepth=configured?Math.max(0,configured.modeledHorizon-tokensRemaining):0;
    const modeled=phase==='fresh_menu'
      ?stratifiedTransitions(exact,resolveFreshMenuOutcomeStrata(fidelityPolicy,recursiveDepth,continuationStrata))
      :(tokensRemaining>1?stratifiedTransitions(exact,continuationEntryStrata):[...exact]);
    addDepthTotal(outcomesBeforeByDepth,recursiveDepth,exact.length);
    addDepthTotal(outcomesAfterByDepth,recursiveDepth,modeled.length);

    let value=0;
    const utilityOutcomes:{value:number;probability:number}[]=[];
    for(const outcome of modeled){
      const continuation=valueFunction.V(outcome.nextState,tokensRemaining-1);
      value+=outcome.probability*continuation;
      if(retain)utilityOutcomes.push({value:continuation,probability:outcome.probability});
    }
    const result={value,utilityOutcomes};if(retain)targetedMemo.set(key,result);return result;
  };

  valueFunction=new FiniteHorizonValueFunction({
    stateId:(engine:EngineState)=>engine.id,
    operationId:(operation:OfferedOperation)=>operation.id,
    allOperations:ACTION_CATALOG,
    menuOperations:(menu:OptimizerState['menu'])=>menu,
    menuId:(menu:OptimizerState['menu'])=>menu.map(operation=>operation.id).sort().join(','),
    terminalUtility:terminal.searchUtility,
    actionValue:(engine,operation,tokensRemaining,phase)=>{
      let best=-Infinity;
      for(const role of OPTIMIZER_ROLES)best=Math.max(best,targetedContinuation(engine,operation,role,tokensRemaining,phase).value);
      return best;
    },
    freshMenuExpectedUtility:(_engine,_tokensRemaining,baseline,operationValues)=>menuModel.expectedFreshMenuUtility(operationValues,baseline),
  });

  const diagnostics=():ContinuationDiagnostics=>({
    continuationFidelity:fidelity,
    targetedActionCacheHits,targetedActionCacheMisses,targetedActionCacheBypasses,targetedActionEntries:targetedMemo.size,
    targetedActionRequestsByDepth:depthRecord(requestsByDepth),targetedActionCacheHitsByDepth:depthRecord(hitsByDepth),
    targetedActionCacheMissesByDepth:depthRecord(missesByDepth),targetedActionCacheBypassesByDepth:depthRecord(bypassesByDepth),
    transitionDistributionCacheHits,transitionDistributionCacheMisses,transitionDistributionCacheBypasses,
    transitionDistributionEntries:transitionMemo.size,transitionEvaluationsByDepth:depthRecord(transitionEvaluationsByDepth),
    transitionOutcomesBeforeCompressionByDepth:depthRecord(outcomesBeforeByDepth),
    transitionOutcomesAfterCompressionByDepth:depthRecord(outcomesAfterByDepth),
  });

  return {valueFunction,menuModel,transitionsFor,targetedContinuation,diagnostics};
}
