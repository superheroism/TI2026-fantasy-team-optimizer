// GENERATED FROM benchmarks/m6d-expanded-adaptive-candidates.json + benchmarks/m6d-selection.json.
// scripts/generate-m6e-policy.mjs is the source-of-truth bridge from certification evidence to production.

export interface ExpandedT2AdaptivePolicy {
  readonly id:string;
  readonly layoutId:'expanded_5';
  readonly horizon:2;
  readonly stages:readonly [2,4,6];
  readonly expectedScoreGapThresholds:readonly [number,number,number];
  readonly targetProbabilityGapThresholds:readonly [number,number,number];
  readonly winnerChangeIsAmbiguous:true;
  readonly exactFallback:true;
  readonly certificationOutcome:'A';
}

export const CERTIFIED_EXPANDED_T2_POLICY:ExpandedT2AdaptivePolicy=Object.freeze({
  id:'adaptive-tight',
  layoutId:'expanded_5',
  horizon:2,
  stages:[2,4,6] as const,
  expectedScoreGapThresholds:[120,80,50] as const,
  targetProbabilityGapThresholds:[0.0015,0.001,0.0005] as const,
  winnerChangeIsAmbiguous:true,
  exactFallback:true,
  certificationOutcome:'A',
});

export function isCertifiedExpandedT2PolicyValid(policy:ExpandedT2AdaptivePolicy):boolean {
  return policy.id==='adaptive-tight'
    &&policy.layoutId==='expanded_5'
    &&policy.horizon===2
    &&policy.certificationOutcome==='A'
    &&policy.winnerChangeIsAmbiguous===true
    &&policy.exactFallback===true
    &&policy.stages.length===3
    &&policy.stages[0]===2&&policy.stages[1]===4&&policy.stages[2]===6
    &&policy.expectedScoreGapThresholds.length===3
    &&policy.expectedScoreGapThresholds.every(Number.isFinite)
    &&policy.targetProbabilityGapThresholds.length===3
    &&policy.targetProbabilityGapThresholds.every(Number.isFinite);
}
