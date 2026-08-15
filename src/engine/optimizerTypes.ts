import type { ActionWideningPolicy } from './actionWidening.js';
import type { ContinuationFidelityPolicy } from './continuationFidelity.js';
import type { MenuOperatorDiagnostics } from './menuModel.js';
import type { ValueFunctionDiagnostics } from './valueFunction.js';

export interface OptimizerSearchOptions {
  readonly modeledHorizonOverride?:number;
  /** Engineering-only exact-oracle switch for regression/certification tooling. Never surfaced in product UI. */
  readonly engineeringForceExact?:boolean;
  /** Engineering-only M5C continuation policy. Ignored unless the modeled horizon exceeds two tokens. */
  readonly experimentalContinuationFidelity?:ContinuationFidelityPolicy;
  /** Engineering-only M5D operation widening policy. Ignored unless the modeled horizon exceeds two tokens. */
  readonly experimentalActionWidening?:ActionWideningPolicy;
}

export interface ExpandedT2AdaptiveStageDiagnostics {
  readonly k:2|4|6|'all';
  readonly winner:string;
  readonly gap:number;
  readonly threshold:number|null;
  readonly winnerChanged:boolean;
  readonly ambiguous:boolean;
  readonly refinedBoardActions:number;
}

export interface ExpandedT2AdaptiveDiagnostics {
  readonly policyId:string;
  readonly rootBoardActionsScreened:number;
  readonly rootBoardActionsRefined:number;
  readonly rootBoardActionsSkipped:number;
  readonly finalStage:'screen'|'k2'|'k4'|'k6'|'exact';
  readonly exactFallback:boolean;
  readonly stages:readonly ExpandedT2AdaptiveStageDiagnostics[];
}

export type OptimizerSearchMode='exact'|'expanded_t2_adaptive'|'expanded_t2_adaptive_exact_fallback'|'expanded_t2_exact_fallback';

export interface OptimizerEngineDiagnostics {
  readonly searchMode:OptimizerSearchMode;
  readonly modeledHorizon:number;
  readonly descriptiveBoardMaterializations:number;
  readonly descriptiveBoardCacheEntries:number;
  readonly expectedScalarStates:number;
  readonly targetScalarStates:number;
  readonly terminalScoringCalls:number;
  readonly expectedScoringMs:number;
  readonly targetScoringMs:number;
  readonly expectedBannerMaterializations:number;
  readonly expectedBannerCacheEntries:number;
  readonly expectedBannerCacheHits:number;
  readonly expectedBannerCacheMisses:number;
  readonly targetBannerMaterializations:number;
  readonly targetBannerCacheEntries:number;
  readonly targetBannerCacheHits:number;
  readonly targetBannerCacheMisses:number;
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
  readonly valueFunction:ValueFunctionDiagnostics;
  readonly menuOperator:MenuOperatorDiagnostics;
  readonly adaptiveRefinement?:ExpandedT2AdaptiveDiagnostics;
  readonly fallbackReason?:string;
}
