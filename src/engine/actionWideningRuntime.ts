import {
  createActionWideningTracker,
  isLegalOperationUtility,
  selectDeepOperationIds,
} from './actionWidening.js';
import type { ActionWideningPolicy, ActionWideningReport } from './actionWidening.js';
import type { ValueActionPhase } from './valueFunction.js';

export interface FreshMenuActionWideningRuntime<State,Operation> {
  evaluate(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number;
  report():ActionWideningReport;
}

export function createFreshMenuActionWideningRuntime<State,Operation>(options:{
  readonly policy:ActionWideningPolicy;
  readonly modeledHorizon:number;
  readonly operations:readonly Operation[];
  stateId(state:State):string|number|bigint;
  operationId(operation:Operation):string;
  shallowValue(state:State,operation:Operation,tokensRemaining:number):number;
  deepValue(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number;
}):FreshMenuActionWideningRuntime<State,Operation> {
  interface Plan {readonly shallowById:ReadonlyMap<string,number>;readonly deepIds:ReadonlySet<string>;remaining:number;}
  const plans=new Map<string,Plan>();
  const tracker=createActionWideningTracker(options.policy);
  const recursiveDepth=(tokensRemaining:number)=>Math.max(1,Math.floor(options.modeledHorizon)-tokensRemaining);
  const keyFor=(state:State,tokensRemaining:number)=>`${String(options.stateId(state))}|${tokensRemaining}`;

  const planFor=(state:State,tokensRemaining:number):Plan=>{
    const key=keyFor(state,tokensRemaining),prior=plans.get(key);if(prior)return prior;
    const shallow=options.operations.map(operation=>({id:options.operationId(operation),value:options.shallowValue(state,operation,tokensRemaining)}));
    const deepIds=selectDeepOperationIds(options.policy,recursiveDepth(tokensRemaining),shallow);
    const legal=shallow.filter(row=>isLegalOperationUtility(row.value)).length;
    tracker.record(recursiveDepth(tokensRemaining),options.operations.length,legal,deepIds.size);
    const plan={shallowById:new Map(shallow.map(row=>[row.id,row.value] as const)),deepIds,remaining:options.operations.length};plans.set(key,plan);return plan;
  };

  const evaluate=(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number=>{
    if(phase!=='fresh_menu')return options.deepValue(state,operation,tokensRemaining,phase);
    const key=keyFor(state,tokensRemaining),plan=planFor(state,tokensRemaining),operationId=options.operationId(operation),shallow=plan.shallowById.get(operationId)??-Infinity;
    const value=plan.deepIds.has(operationId)?options.deepValue(state,operation,tokensRemaining,phase):shallow;
    plan.remaining--;if(plan.remaining<=0)plans.delete(key);return value;
  };

  return {evaluate,report:tracker.report};
}
