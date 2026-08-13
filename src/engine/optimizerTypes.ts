import type { MenuOperatorDiagnostics } from './menuModel.js';
import type { ValueFunctionDiagnostics } from './valueFunction.js';

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
  readonly expectedBannerMaterializations:number;
  readonly expectedBannerCacheEntries:number;
  readonly expectedBannerCacheHits:number;
  readonly expectedBannerCacheMisses:number;
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
  readonly valueFunction:ValueFunctionDiagnostics;
  readonly menuOperator:MenuOperatorDiagnostics;
}
