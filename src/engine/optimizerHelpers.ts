import type { BoardEvaluation, DecisionAction, OptimizerState, Role } from '../domain/types.js';
import type { EngineTransition } from './compactTransitions.js';
import type { BoardStateID, EngineState } from './stateEncoding.js';

export const OPTIMIZER_ROLES:readonly Role[]=['core','mid','support'];

export function incrementDepth(map:Map<number,number>,depth:number):void { map.set(depth,(map.get(depth)??0)+1); }
export function depthRecord(map:ReadonlyMap<number,number>):Record<string,number> {
  const out:Record<string,number>={};for(const [depth,count] of map)out[String(depth)]=count;return out;
}
export function utility(evaluation:BoardEvaluation,state:OptimizerState):number {
  return state.objective==='target_probability'?(evaluation.targetProbability??0):evaluation.expected;
}
export function formatAction(action:DecisionAction,state?:OptimizerState):string {
  if(action.kind==='stop')return 'Best Current Setup';
  if(action.kind==='menu_reroll')return 'Reroll operation menu';
  const label=state?.menu.find(o=>o.id===action.operationId)?.label??action.operationId;
  return `${action.banner.toUpperCase()} → ${label}`;
}
export function weightedQuantile(points:{value:number;probability:number}[],q:number):number|undefined {
  const clean=points.filter(x=>Number.isFinite(x.value)&&x.probability>0).sort((a,b)=>a.value-b.value);
  const total=clean.reduce((sum,x)=>sum+x.probability,0);if(total<=0)return undefined;
  const target=Math.max(0,Math.min(1,q))*total;let cumulative=0;
  for(const x of clean){cumulative+=x.probability;if(cumulative>=target)return x.value;}return clean.at(-1)?.value;
}
export function stratifiedTransitions(outcomes:readonly EngineTransition[],maxStrata:number):EngineTransition[] {
  if(maxStrata<=0||outcomes.length<=maxStrata)return [...outcomes];
  const total=outcomes.reduce((s,x)=>s+x.probability,0);if(total<=0)return [];
  const normalized=outcomes.map(x=>({...x,probability:x.probability/total}));
  const selected:EngineTransition[]=[];let cumulative=0,index=0;
  for(let stratum=0;stratum<maxStrata;stratum++){
    const target=(stratum+0.5)/maxStrata;
    while(index<normalized.length-1&&cumulative+normalized[index]!.probability<target){cumulative+=normalized[index]!.probability;index++;}
    selected.push({...normalized[index]!,probability:1/maxStrata});
  }
  const grouped=new Map<BoardStateID,{nextState:EngineState;probability:number;note?:string}>();
  for(const x of selected){const prior=grouped.get(x.nextState.id);if(prior)prior.probability+=x.probability;else grouped.set(x.nextState.id,{...x});}
  return [...grouped.values()];
}
