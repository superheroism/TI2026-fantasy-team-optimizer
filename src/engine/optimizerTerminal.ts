import type { BoardEvaluation, DataBundle, OptimizerState } from '../domain/types.js';
import { createEngineExpectedScorer } from './engineExpectedScoring.js';
import { evaluateBoardTargetProbabilityFast } from './targetProbability.js';
import { boardAdapterContext, boardToEngineState, engineStateToBoard } from './stateEncoding.js';
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
  const expectedScorer=createEngineExpectedScorer(context,data,data.simulation.optimizerIterations);
  const boardMemo=new Map<BoardStateID,OptimizerState['board']>([[initialEngine.id,state.board]]);
  const expectedMemo=new Map<BoardStateID,number>();
  const targetMemo=new Map<BoardStateID,number>();
  let descriptiveBoardMaterializations=0,terminalScoringCalls=0;

  const boardFor=(engine:EngineState):OptimizerState['board']=>{
    const prior=boardMemo.get(engine.id);if(prior)return prior;
    const board=engineStateToBoard(engine,context);boardMemo.set(engine.id,board);descriptiveBoardMaterializations++;return board;
  };
  const expectedScalar=(engine:EngineState):number=>{
    const prior=expectedMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=expectedScorer.evaluate(engine);expectedMemo.set(engine.id,value);return value;
  };
  const targetScalar=(engine:EngineState):number=>{
    const prior=targetMemo.get(engine.id);if(prior!==undefined)return prior;
    terminalScoringCalls++;
    const value=evaluateBoardTargetProbabilityFast(boardFor(engine),data,state.targetScore??0,data.simulation.optimizerIterations);
    targetMemo.set(engine.id,value);return value;
  };
  const searchUtility=(engine:EngineState):number=>state.objective==='expected_score'?expectedScalar(engine):targetScalar(engine);
  const seedCurrent=(current:BoardEvaluation):void=>{
    if(state.objective==='expected_score')expectedMemo.set(initialEngine.id,current.expected);
    else if(current.targetProbability!==undefined)targetMemo.set(initialEngine.id,current.targetProbability);
  };
  const diagnostics=():TerminalSearchDiagnostics=>{
    const compact=expectedScorer.getDiagnostics();
    return {
      descriptiveBoardMaterializations,descriptiveBoardCacheEntries:boardMemo.size,
      expectedScalarStates:expectedMemo.size,targetScalarStates:targetMemo.size,terminalScoringCalls,
      expectedBannerMaterializations:compact.bannerMaterializations,
      expectedBannerCacheEntries:compact.bannerCacheEntries,
      expectedBannerCacheHits:compact.bannerCacheHits,
      expectedBannerCacheMisses:compact.bannerCacheMisses,
    };
  };

  return {initialEngine,expectedScalar,targetScalar,searchUtility,seedCurrent,diagnostics};
}
