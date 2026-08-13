export type ValueStateID=string|number|bigint;
export type ValueActionPhase='current_menu'|'fresh_menu';

export interface FiniteHorizonValueModel<State,Operation,Menu> {
  stateId(state:State):ValueStateID;
  operationId(operation:Operation):string;
  allOperations:readonly Operation[];
  menuOperations(menu:Menu):readonly Operation[];
  menuId?(menu:Menu):string;
  terminalUtility(state:State):number;
  actionValue(
    state:State,
    operation:Operation,
    tokensRemaining:number,
    phase:ValueActionPhase,
    continuation:(nextState:State)=>number,
  ):number;
  freshMenuExpectedUtility(
    state:State,
    tokensRemaining:number,
    baseline:number,
    operationValues:readonly {id:string;value:number}[],
  ):number;
}

export interface ValueFunctionDiagnostics {
  readonly terminalCacheHits:number;
  readonly terminalCacheMisses:number;
  readonly vCalls:number;
  readonly vCacheHits:number;
  readonly vCacheMisses:number;
  readonly qCalls:number;
  readonly qCacheHits:number;
  readonly qCacheMisses:number;
  readonly actionCalls:number;
  readonly actionCacheHits:number;
  readonly actionCacheMisses:number;
  /** Unique V state identities requested at each token depth, including t=0. */
  readonly uniqueStatesByDepth:Readonly<Record<string,number>>;
  readonly uniqueQStatesByDepth:Readonly<Record<string,number>>;
  readonly uniqueActionStatesByDepth:Readonly<Record<string,number>>;
  readonly vCallsByDepth:Readonly<Record<string,number>>;
  readonly vCacheHitsByDepth:Readonly<Record<string,number>>;
  readonly vCacheMissesByDepth:Readonly<Record<string,number>>;
  readonly qCallsByDepth:Readonly<Record<string,number>>;
  readonly qCacheHitsByDepth:Readonly<Record<string,number>>;
  readonly qCacheMissesByDepth:Readonly<Record<string,number>>;
  readonly actionCallsByDepth:Readonly<Record<string,number>>;
  readonly actionCacheHitsByDepth:Readonly<Record<string,number>>;
  readonly actionCacheMissesByDepth:Readonly<Record<string,number>>;
  /** Retained M4 name: cache-miss action evaluations by token depth. */
  readonly actionEvaluationsByDepth:Readonly<Record<string,number>>;
  readonly terminalEntries:number;
  readonly vEntries:number;
  readonly qEntries:number;
  readonly actionEntries:number;
  readonly elapsedMs:number;
}

interface MutableDiagnostics {
  terminalCacheHits:number;
  terminalCacheMisses:number;
  vCalls:number;
  vCacheHits:number;
  vCacheMisses:number;
  qCalls:number;
  qCacheHits:number;
  qCacheMisses:number;
  actionCalls:number;
  actionCacheHits:number;
  actionCacheMisses:number;
}

function cacheKey(id:ValueStateID,tokens:number,suffix=''):string {
  return `${typeof id}:${String(id)}|${tokens}${suffix}`;
}

function bump(map:Map<number,number>,depth:number):void {
  map.set(depth,(map.get(depth)??0)+1);
}

function toRecord(map:ReadonlyMap<number,number>):Record<string,number> {
  const result:Record<string,number>={};
  for(const [depth,count] of map)result[String(depth)]=count;
  return result;
}

function setSizes(map:ReadonlyMap<number,ReadonlySet<unknown>>):Record<string,number> {
  const result:Record<string,number>={};
  for(const [depth,values] of map)result[String(depth)]=values.size;
  return result;
}

/**
 * Generic finite-horizon V/Q engine. Mechanics and scoring are callbacks; the
 * engine owns only token recursion, stopping/menu-reroll policy, and memoization.
 */
export class FiniteHorizonValueFunction<State,Operation,Menu> {
  private readonly startedAt=performance.now();
  private readonly terminalMemo=new Map<ValueStateID,number>();
  private readonly vMemo=new Map<string,number>();
  private readonly qMemo=new Map<string,number>();
  private readonly actionMemo=new Map<string,number>();
  private readonly statesByDepth=new Map<number,Set<ValueStateID>>();
  private readonly qStatesByDepth=new Map<number,Set<ValueStateID>>();
  private readonly actionStatesByDepth=new Map<number,Set<string>>();
  private readonly vCallsByDepth=new Map<number,number>();
  private readonly vCacheHitsByDepth=new Map<number,number>();
  private readonly vCacheMissesByDepth=new Map<number,number>();
  private readonly qCallsByDepth=new Map<number,number>();
  private readonly qCacheHitsByDepth=new Map<number,number>();
  private readonly qCacheMissesByDepth=new Map<number,number>();
  private readonly actionCallsByDepth=new Map<number,number>();
  private readonly actionCacheHitsByDepth=new Map<number,number>();
  private readonly actionCacheMissesByDepth=new Map<number,number>();
  private readonly actionEvaluationsByDepth=new Map<number,number>();
  private readonly diagnostics:MutableDiagnostics={
    terminalCacheHits:0,terminalCacheMisses:0,
    vCalls:0,vCacheHits:0,vCacheMisses:0,
    qCalls:0,qCacheHits:0,qCacheMisses:0,
    actionCalls:0,actionCacheHits:0,actionCacheMisses:0,
  };

  constructor(private readonly model:FiniteHorizonValueModel<State,Operation,Menu>) {}

  seedTerminalUtility(state:State,value:number):void {
    this.terminalMemo.set(this.model.stateId(state),value);
  }

  terminal(state:State):number {
    const id=this.model.stateId(state);
    const prior=this.terminalMemo.get(id);
    if(prior!==undefined){this.diagnostics.terminalCacheHits++;return prior;}
    this.diagnostics.terminalCacheMisses++;
    const value=this.model.terminalUtility(state);
    this.terminalMemo.set(id,value);
    return value;
  }

  /** A(B,a,t): action continuation value. */
  A(state:State,operation:Operation,tokensRemaining:number,phase:ValueActionPhase):number {
    const t=Math.max(0,tokensRemaining);
    this.diagnostics.actionCalls++;bump(this.actionCallsByDepth,t);
    const id=this.model.stateId(state);
    const operationId=this.model.operationId(operation);
    const key=cacheKey(id,t,`|${phase}|${operationId}`);
    let states=this.actionStatesByDepth.get(t);if(!states){states=new Set();this.actionStatesByDepth.set(t,states);}states.add(key);
    if(t<=0)return -Infinity;
    const prior=this.actionMemo.get(key);
    if(prior!==undefined){this.diagnostics.actionCacheHits++;bump(this.actionCacheHitsByDepth,t);return prior;}
    this.diagnostics.actionCacheMisses++;bump(this.actionCacheMissesByDepth,t);bump(this.actionEvaluationsByDepth,t);
    const value=this.model.actionValue(
      state,
      operation,
      t,
      phase,
      nextState=>this.V(nextState,t-1),
    );
    this.actionMemo.set(key,value);
    return value;
  }

  /** V(B,t): value before observing a fresh menu. */
  V(state:State,tokensRemaining:number):number {
    const t=Math.max(0,tokensRemaining);
    this.diagnostics.vCalls++;bump(this.vCallsByDepth,t);
    const id=this.model.stateId(state);
    let states=this.statesByDepth.get(t);if(!states){states=new Set();this.statesByDepth.set(t,states);}states.add(id);
    if(t===0)return this.terminal(state);
    const key=cacheKey(id,t);
    const prior=this.vMemo.get(key);
    if(prior!==undefined){this.diagnostics.vCacheHits++;bump(this.vCacheHitsByDepth,t);return prior;}
    this.diagnostics.vCacheMisses++;bump(this.vCacheMissesByDepth,t);

    const stop=this.terminal(state);
    // Spending the last token on a menu reroll cannot improve the board. With
    // two or more modeled spends remaining, reroll continuation is V(B,t-1).
    const reroll=t>1?this.V(state,t-1):stop;
    const baseline=Math.max(stop,reroll);
    const operationValues=this.model.allOperations.map(operation=>({
      id:this.model.operationId(operation),
      value:this.A(state,operation,t,'fresh_menu'),
    }));
    const value=this.model.freshMenuExpectedUtility(state,t,baseline,operationValues);
    this.vMemo.set(key,value);
    return value;
  }

  /** Q(B,M,t): value after observing the current menu. */
  Q(state:State,menu:Menu,tokensRemaining:number):number {
    const t=Math.max(0,tokensRemaining);
    this.diagnostics.qCalls++;bump(this.qCallsByDepth,t);
    const id=this.model.stateId(state);
    let states=this.qStatesByDepth.get(t);if(!states){states=new Set();this.qStatesByDepth.set(t,states);}states.add(id);
    if(t===0)return this.terminal(state);
    const menuId=this.model.menuId?.(menu)
      ??this.model.menuOperations(menu).map(operation=>this.model.operationId(operation)).sort().join(',');
    const key=cacheKey(id,t,`|${menuId}`);
    const prior=this.qMemo.get(key);
    if(prior!==undefined){this.diagnostics.qCacheHits++;bump(this.qCacheHitsByDepth,t);return prior;}
    this.diagnostics.qCacheMisses++;bump(this.qCacheMissesByDepth,t);

    const stop=this.terminal(state);
    let best=t>1?Math.max(stop,this.V(state,t-1)):stop;
    for(const operation of this.model.menuOperations(menu)) {
      best=Math.max(best,this.A(state,operation,t,'current_menu'));
    }
    this.qMemo.set(key,best);
    return best;
  }

  getDiagnostics():ValueFunctionDiagnostics {
    return {
      ...this.diagnostics,
      uniqueStatesByDepth:setSizes(this.statesByDepth),
      uniqueQStatesByDepth:setSizes(this.qStatesByDepth),
      uniqueActionStatesByDepth:setSizes(this.actionStatesByDepth),
      vCallsByDepth:toRecord(this.vCallsByDepth),
      vCacheHitsByDepth:toRecord(this.vCacheHitsByDepth),
      vCacheMissesByDepth:toRecord(this.vCacheMissesByDepth),
      qCallsByDepth:toRecord(this.qCallsByDepth),
      qCacheHitsByDepth:toRecord(this.qCacheHitsByDepth),
      qCacheMissesByDepth:toRecord(this.qCacheMissesByDepth),
      actionCallsByDepth:toRecord(this.actionCallsByDepth),
      actionCacheHitsByDepth:toRecord(this.actionCacheHitsByDepth),
      actionCacheMissesByDepth:toRecord(this.actionCacheMissesByDepth),
      actionEvaluationsByDepth:toRecord(this.actionEvaluationsByDepth),
      terminalEntries:this.terminalMemo.size,
      vEntries:this.vMemo.size,
      qEntries:this.qMemo.size,
      actionEntries:this.actionMemo.size,
      elapsedMs:performance.now()-this.startedAt,
    };
  }
}
