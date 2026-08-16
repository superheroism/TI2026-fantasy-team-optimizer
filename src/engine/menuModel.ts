import type { MenuState } from '../domain/types.js';

export interface OperationMenuValue {
  readonly id:string;
  readonly value:number;
}

export interface MenuOperatorDiagnostics {
  readonly calls:number;
  readonly uniformCalls:number;
  readonly overrideCalls:number;
  readonly explicitMenusScanned:number;
  readonly operatorMs:number;
}

interface MutableMenuOperatorDiagnostics {
  calls:number;
  uniformCalls:number;
  overrideCalls:number;
  explicitMenusScanned:number;
  operatorMs:number;
}

function newDiagnostics():MutableMenuOperatorDiagnostics {
  return {calls:0,uniformCalls:0,overrideCalls:0,explicitMenusScanned:0,operatorMs:0};
}

function choose3(n:number):number {
  return n<3?0:(n*(n-1)*(n-2))/6;
}

/**
 * Exact expectation of max(baseline, best operation in a uniformly sampled
 * 3-without-replacement menu). Every element is a distinct operation identity,
 * even when multiple identities have equal continuation value.
 */
export function expectedUniformBestOfThree(
  values:readonly OperationMenuValue[],
  baseline:number,
):number {
  if(values.length<3) return baseline;
  const ranked=values
    .map((entry,index)=>({entry,index}))
    .sort((a,b)=>a.entry.value-b.entry.value||a.index-b.index);
  const denominator=choose3(ranked.length);
  let expected=0;
  for(let k=2;k<ranked.length;k++) {
    const weight=((k*(k-1))/2)/denominator;
    expected+=weight*Math.max(baseline,ranked[k]!.entry.value);
  }
  return expected;
}

/** Exact probability that a uniform fresh menu contains a value above baseline. */
export function probabilityUniformBestOfThreeImproves(
  values:readonly OperationMenuValue[],
  baseline:number,
):number {
  const total=choose3(values.length);
  if(total===0)return 0;
  const nonImproving=values.filter(entry=>!(entry.value>baseline)).length;
  return 1-choose3(nonImproving)/total;
}

/** Reference/sample path for arbitrary empirical or non-uniform menu samples. */
export function expectedExplicitMenuSamples(
  values:readonly OperationMenuValue[],
  baseline:number,
  menuSamples:readonly MenuState[],
):number {
  if(!menuSamples.length)return baseline;
  const byId=new Map(values.map(entry=>[entry.id,entry.value] as const));
  let sum=0;
  for(const menu of menuSamples) {
    let best=baseline;
    for(const operation of menu) best=Math.max(best,byId.get(operation.id)??-Infinity);
    sum+=best;
  }
  return sum/menuSamples.length;
}

/** Probability that an explicit sampled menu contains an operation above baseline. */
export function probabilityExplicitMenuSamplesImprove(
  values:readonly OperationMenuValue[],
  baseline:number,
  menuSamples:readonly MenuState[],
):number {
  if(!menuSamples.length)return 0;
  const byId=new Map(values.map(entry=>[entry.id,entry.value] as const));
  let improving=0;
  for(const menu of menuSamples) {
    let best=-Infinity;
    for(const operation of menu)best=Math.max(best,byId.get(operation.id)??-Infinity);
    if(best>baseline)improving++;
  }
  return improving/menuSamples.length;
}

/**
 * Search-facing menu boundary. The normal TI 2026 rule uses the exact analytic
 * operator; supplied menuSamples retain their explicit empirical semantics.
 */
export class MenuModel {
  readonly mode:'known_uniform'|'override_samples';
  private diagnostics=newDiagnostics();

  constructor(private readonly menuSamples?:readonly MenuState[]) {
    this.mode=menuSamples?.length?'override_samples':'known_uniform';
  }

  expectedFreshMenuUtility(values:readonly OperationMenuValue[],baseline:number):number {
    const start=performance.now();
    this.diagnostics.calls++;
    let result:number;
    if(this.mode==='override_samples') {
      this.diagnostics.overrideCalls++;
      this.diagnostics.explicitMenusScanned+=this.menuSamples?.length??0;
      result=expectedExplicitMenuSamples(values,baseline,this.menuSamples??[]);
    } else {
      this.diagnostics.uniformCalls++;
      result=expectedUniformBestOfThree(values,baseline);
    }
    this.diagnostics.operatorMs+=performance.now()-start;
    return result;
  }

  freshMenuImprovementProbability(values:readonly OperationMenuValue[],baseline:number):number {
    return this.mode==='override_samples'
      ?probabilityExplicitMenuSamplesImprove(values,baseline,this.menuSamples??[])
      :probabilityUniformBestOfThreeImproves(values,baseline);
  }

  getDiagnostics():MenuOperatorDiagnostics { return {...this.diagnostics}; }
}
