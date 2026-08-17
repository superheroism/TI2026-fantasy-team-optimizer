export const STAT_MATCH_GATE=.92;
export const STRUCTURED_CONFIDENCE_GATE=.90;
export const EXACT_STAT_CONFIDENCE_GATE=.82;
export const FUZZY_STAT_MATCH_GATE=.70;
export const FUZZY_STAT_MARGIN_GATE=.25;
export const FUZZY_STAT_CONFIDENCE_GATE=.68;
export const LONG_TOKEN_STAT_LENGTH_GATE=6;
// Real-image calibration: noisy long tokens can retain a meaningful legal-pool lead near 0.10 even when short tokens remain ambiguous.
export const LONG_TOKEN_STAT_MARGIN_GATE=.10;
export const LONG_TOKEN_STAT_EXISTING_CONFIDENCE_CEILING=.70;

/**
 * Accept stat evidence from exact/high-confidence text, the historical strong
 * fuzzy gate, or a bounded long-token recovery when a weak existing field has
 * strong absolute evidence and a meaningful same-color lead. The measured confidence is retained;
 * this function never promotes a review-required value to high confidence.
 */
export function acceptsStatEvidence(matchScore:number,confidence:number,runnerUpMargin=0,candidateLength=0,existingConfidence=1):boolean{
  if(matchScore>=.999&&confidence>=EXACT_STAT_CONFIDENCE_GATE)return true;
  if(matchScore>=FUZZY_STAT_MATCH_GATE&&runnerUpMargin>=FUZZY_STAT_MARGIN_GATE&&confidence>=FUZZY_STAT_CONFIDENCE_GATE)return true;
  if(candidateLength>=LONG_TOKEN_STAT_LENGTH_GATE&&existingConfidence<LONG_TOKEN_STAT_EXISTING_CONFIDENCE_CEILING&&matchScore>=FUZZY_STAT_MATCH_GATE&&runnerUpMargin>=LONG_TOKEN_STAT_MARGIN_GATE)return true;
  return matchScore>=STAT_MATCH_GATE&&confidence>=STRUCTURED_CONFIDENCE_GATE;
}

export function shouldRetryStat(confidence:number):boolean{
  return confidence<STRUCTURED_CONFIDENCE_GATE;
}

export function shouldRetryTier(confidence:number):boolean{
  return confidence<STRUCTURED_CONFIDENCE_GATE;
}

export async function runStatRepresentationFallbacks(
  confidence:()=>number,
  runOtsu:()=>Promise<void>,
  runRaw:()=>Promise<void>,
):Promise<{usedOtsu:boolean;usedRaw:boolean}>{
  if(!shouldRetryStat(confidence()))return{usedOtsu:false,usedRaw:false};
  await runOtsu();
  if(!shouldRetryStat(confidence()))return{usedOtsu:true,usedRaw:false};
  await runRaw();
  return{usedOtsu:true,usedRaw:true};
}
