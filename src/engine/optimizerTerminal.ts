import type { BoardEvaluation, DataBundle, OptimizerState } from '../domain/types.js';
import { createEngineExpectedScorer } from './engineExpectedScoring.js';
import { createEngineTargetScorer } from './engineTargetScoring.js';
import { boardAdapterContext, boardToEngineState } from './stateEncoding.js';
import type { BoardStateID, EngineState } from './stateEncoding.js';

export interface TerminalSearchDiagnostics {
  readonly descriptiveBoardMaterializations:number;
  readonly descriptiveBoardCacheEntries:number;
  readonly expectedScalarStates:number;
  readonly targetScalarStates:number;
  readonly terminalScoringCalls:number;
  readonly expectedBannerMaterializations:number;
  readonly expectedBannerCacheEntries:number;
  readonly expectedBannerCacheHits:number;
  readonly expectedBannerCacheMisses:number;
  readonly targetBannerMaterializations:number;
  readonly targetBannerCacheEntries:number;
  readonly targetBannerCacheHits:number;
  readonly targetBannerCacheMisses:number;
}

export interface TerminalSearchRuntime {
  readonly initialEngine:EngineState;
  expectedScalar(engine:EngineState):number;
  targetScalar(engine:EngineState):number;
  searchUtility(engine:EngineState):number;
  seedCurrent(current:BoardEvaluation):void;
  diagnostics():TerminalSearchDiagnostics;
}

export function createTerminalSearchRuntime(state:OptimizerState,data:DataBundle):TerminalSearchRuntime {
  const context=boardAdapterContext(state.board);
  const initialEngine=boardToEngineState(state.board);
  const expectedScorer=createEngineExpectedScorer(context,data,data.simulation.optimizerIterations,initialEngine.layoutId);
  const targetScorer=createEngineTargetScorer(context,data,state.targetScore??0,data.simulation.optimizerIterations,initialEngine.layoutId);
  const expectedMemo=new Map<BoardStateID,number>();
  const targetMemo=new Map<BoardStateID,number>();
  let terminalScoringCalls=0;

  const expectedScalar=(engine:EngineState):number=>{
    const prior=expectedMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=expectedScorer.evaluate(engine);expectedMemo.set(engine.id,value);return value;
  };
  const targetScalar=(engine:EngineState):number=>{
    const prior=targetMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=targetScorer.evaluate(engine);targetMemo.set(engine.id,value);return value;
  };
  const searchUtility=(engine:EngineState):number=>state.objective==='expected_score'?expectedScalar(engine):targetScalar(engine);
  const seedCurrent=(current:BoardEvaluation):void=>{
    if(state.objective==='expected_score')expectedMemo.set(initialEngine.id,current.expected);
    else if(current.targetProbability!==undefined)targetMemo.set(initialEngine.id,current.targetProbability);
  };
  const diagnostics=():TerminalSearchDiagnostics=>{
    const expectedCompact=expectedScorer.getDiagnostics(),targetCompact=targetScorer.getDiagnostics();
    return {
      descriptiveBoardMaterializations:0,descriptiveBoardCacheEntries:1,
      expectedScalarStates:expectedMemo.size,targetScalarStates:targetMemo.size,terminalScoringCalls,
      expectedBannerMaterializations:expectedCompact.bannerMaterializations,
      expectedBannerCacheEntries:expectedCompact.bannerCacheEntries,
      expectedBannerCacheHits:expectedCompact.bannerCacheHits,
      expectedBannerCacheMisses:expectedCompact.bannerCacheMisses,
      targetBannerMaterializations:targetCompact.bannerMaterializations,
      targetBannerCacheEntries:targetCompact.bannerCacheEntries,
      targetBannerCacheHits:targetCompact.bannerCacheHits,
      targetBannerCacheMisses:targetCompact.bannerCacheMisses,
    };
  };

  return {initialEngine,expectedScalar,targetScalar,searchUtility,seedCurrent,diagnostics};
}
