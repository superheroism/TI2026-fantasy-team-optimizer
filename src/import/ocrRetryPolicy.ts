export const STAT_MATCH_GATE=.92;
export const STRUCTURED_CONFIDENCE_GATE=.90;

export function acceptsStatEvidence(matchScore:number,confidence:number):boolean{
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
