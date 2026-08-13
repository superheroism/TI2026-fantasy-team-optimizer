import type { ActionWideningPolicy, ProxyRankDiagnostics } from './actionWidening.js';
import type { ContinuationFidelityPolicy } from './continuationFidelity.js';
import type { MenuOperatorDiagnostics } from './menuModel.js';
import type { ValueFunctionDiagnostics } from './valueFunction.js';

export interface OptimizerSearchOptions {
  readonly modeledHorizonOverride?:number;
  /** Engineering-only M5C continuation policy. Ignored unless the modeled horizon exceeds two tokens. */
  readonly experimentalContinuationFidelity?:ContinuationFidelityPolicy;
  /** Engineering-only M5D operation widening policy. Ignored unless the modeled horizon exceeds two tokens. */
  readonly experimentalActionWidening?:ActionWideningPolicy;
  /** Untimed engineering diagnostic only. Ignored unless the modeled horizon exceeds two tokens. */
  readonly experimentalActionWideningProxyDiagnostics?:boolean;
  readonly experimentalActionWideningProxySampleLimitPerDepth?:number;
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
  readonly transitionOutcomesBeforeCompressionByDepth:Readonly<Record<string,number>>;
  readonly transitionOutcomesAfterCompressionByDepth:Readonly<Record<string,number>>;
  readonly continuationFidelity:import('./continuationFidelity.js').ContinuationFidelityReport;
  readonly actionWidening:import('./actionWidening.js').ActionWideningReport;
  readonly proxyRankDiagnostics:ProxyRankDiagnostics;
  readonly valueFunction:ValueFunctionDiagnostics;
  readonly menuOperator:MenuOperatorDiagnostics;
}
