// GENERATED FROM benchmarks/m6d-expanded-adaptive-candidates.json + benchmarks/m6d-selection.json.
// scripts/build.mjs validates this committed runtime module against those certification artifacts.

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
  stages:[2,4,6],
  expectedScoreGapThresholds:[120,80,50],
  targetProbabilityGapThresholds:[0.0015,0.0010,0.0005],
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
