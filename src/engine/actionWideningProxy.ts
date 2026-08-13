import { isLegalOperationUtility, rankOperationUtilities, summarizeProxyRanks } from './actionWidening.js';
import type { DeepWinnerShallowRankObservation, ProxyRankDiagnostics } from './actionWidening.js';
import type { ValueActionPhase } from './valueFunction.js';

export interface FreshMenuProxyRankRuntime<State,Operation> {
  evaluate(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number;
  report():ProxyRankDiagnostics;
}

export function createFreshMenuProxyRankRuntime<State,Operation>(options:{
  readonly modeledHorizon:number;
  readonly operations:readonly Operation[];
  readonly sampleLimitPerDepth:number;
  stateId(state:State):string|number|bigint;
  operationId(operation:Operation):string;
  shallowValue(state:State,operation:Operation,tokensRemaining:number):number;
  deepValue(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number;
}):FreshMenuProxyRankRuntime<State,Operation> {
  interface Plan {
    readonly shallow:readonly {id:string;value:number}[];
    readonly fullValues:Map<string,number>;
    remaining:number;
  }
  const observations:DeepWinnerShallowRankObservation[]=[];
  const samplesByDepth=new Map<number,number>();
  const plans=new Map<string,Plan>();
  const limit=Math.max(1,Math.floor(options.sampleLimitPerDepth));
  const depthFor=(tokens:number)=>Math.max(1,Math.floor(options.modeledHorizon)-tokens);
  const keyFor=(state:State,tokens:number)=>`${String(options.stateId(state))}|${tokens}`;

  const evaluate=(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number=>{
    if(phase!=='fresh_menu')return options.deepValue(state,operation,tokensRemaining,phase);
    const depth=depthFor(tokensRemaining),key=keyFor(state,tokensRemaining);
    let plan=plans.get(key);
    if(!plan&&(samplesByDepth.get(depth)??0)<limit){
      const shallow=rankOperationUtilities(options.operations.map(item=>({id:options.operationId(item),value:options.shallowValue(state,item,tokensRemaining)})));
      plan={shallow,fullValues:new Map(),remaining:options.operations.length};plans.set(key,plan);samplesByDepth.set(depth,(samplesByDepth.get(depth)??0)+1);
    }
    const value=options.deepValue(state,operation,tokensRemaining,phase);
    if(!plan)return value;
    plan.fullValues.set(options.operationId(operation),value);plan.remaining--;
    if(plan.remaining<=0){
      const full=rankOperationUtilities([...plan.fullValues].map(([id,rowValue])=>({id,value:rowValue}))).filter(row=>isLegalOperationUtility(row.value));
      const shallow=plan.shallow.filter(row=>isLegalOperationUtility(row.value));
      if(full.length){
        const winner=full[0],rank=shallow.findIndex(row=>row.id===winner.id)+1;
        if(rank>0)observations.push({stateId:String(options.stateId(state)),recursiveDepth:depth,fullDepthBestOperationId:winner.id,deepWinnerShallowRank:rank,fullDepthTopTwoGap:full[1]?winner.value-full[1].value:0,shallowTopTwoGap:shallow[1]?shallow[0].value-shallow[1].value:0});
      }
      plans.delete(key);
    }
    return value;
  };

  return {evaluate,report:()=>summarizeProxyRanks(observations,limit)};
}
