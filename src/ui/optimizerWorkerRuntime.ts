import type { DataBundle, OptimizerState, RecommendationResult } from '../domain/types.js';
import { getLastOptimizerEngineDiagnostics, recommendNextAction } from '../engine/optimizer.js';
import type { OptimizerEngineDiagnostics } from '../engine/optimizer.js';

export interface OptimizerWorkerResult {
  result:RecommendationResult;
  diagnostics:OptimizerEngineDiagnostics;
  optimizerWallMs:number;
}

/** Pure worker-side boundary retained separately so Node parity tests can exercise the exact worker path. */
export function runOptimizerWorkerRequest(state:OptimizerState,data:DataBundle):OptimizerWorkerResult {
  const started=performance.now();
  const result=recommendNextAction(state,data,true);
  return {result,diagnostics:getLastOptimizerEngineDiagnostics(),optimizerWallMs:performance.now()-started};
}
