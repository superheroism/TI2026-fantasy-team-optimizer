export const M5D_WIDENING_ORDER=['wide','medium','narrow'];

export function percentile(values,q){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),index=Math.min(sorted.length-1,Math.max(0,Math.floor(q*(sorted.length-1))));
  return sorted[index];
}

export function recommendationType(key){
  if(key==='stop')return 'stop';
  if(key==='menu_reroll')return 'menu_reroll';
  return 'board_action';
}

export function actionFamily(key){
  const type=recommendationType(key);if(type!=='board_action')return type;
  const operationId=key.split('|')[1]??'';
  if(operationId.includes('stat'))return 'stat';
  if(operationId.includes('quality'))return 'quality';
  if(operationId.includes('trait'))return 'trait';
  return 'other';
}

export function marginBin(gap){return gap<=500?'<=500':gap<=1500?'500-1500':'>1500';}

export function kendallTau(oracle,approx){
  const a=new Map(oracle.map((row,index)=>[row.key,index])),b=new Map(approx.map((row,index)=>[row.key,index]));
  const keys=[...a.keys()].filter(key=>b.has(key));let concordant=0,discordant=0;
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const left=Math.sign(a.get(keys[i])-a.get(keys[j])),right=Math.sign(b.get(keys[i])-b.get(keys[j]));
    if(left===right)concordant++;else discordant++;
  }
  return concordant+discordant?(concordant-discordant)/(concordant+discordant):1;
}

export function compareRuns(oracle,approx,extra={}){
  const byKey=new Map(oracle.ranking.map(row=>[row.key,row]));
  const gap=oracle.ranking[1]?oracle.ranking[0].utility-oracle.ranking[1].utility:0;
  const chosen=byKey.get(approx.recommendationKey),regret=chosen?oracle.utility-chosen.utility:null;
  const errors=approx.ranking.map(row=>{const base=byKey.get(row.key);return base?Math.abs(row.utility-base.utility):null;}).filter(value=>value!==null);
  return {
    fixture:oracle.fixture,topActionAgreement:approx.recommendationKey===oracle.recommendationKey,
    oracleBestKey:oracle.recommendationKey,approxBestKey:approx.recommendationKey,
    oracleRecommendationType:recommendationType(oracle.recommendationKey),approxRecommendationType:recommendationType(approx.recommendationKey),
    oracleActionFamily:actionFamily(oracle.recommendationKey),approxActionFamily:actionFamily(approx.recommendationKey),
    oracleTopTwoGap:gap,marginBin:marginBin(gap),oracleRegret:regret,
    normalizedRegret:regret===null?null:regret/Math.max(Math.abs(gap),1),
    kendallTau:kendallTau(oracle.ranking,approx.ranking),
    meanAbsoluteUtilityError:errors.reduce((sum,value)=>sum+value,0)/Math.max(errors.length,1),
    maxAbsoluteUtilityError:Math.max(0,...errors),runtimeMs:approx.runtimeMs,oracleRuntimeMs:oracle.runtimeMs,
    runtimeRatioVsOracle:approx.runtimeMs/oracle.runtimeMs,...extra,
  };
}

function marginSummary(rows){
  const out={};for(const bin of ['<=500','500-1500','>1500']){const part=rows.filter(row=>row.marginBin===bin);out[bin]={cases:part.length,agreements:part.filter(row=>row.topActionAgreement).length,agreementRate:part.length?part.filter(row=>row.topActionAgreement).length/part.length:null};}return out;
}

export function summarizeComparisons(rows){
  const regrets=rows.map(row=>row.oracleRegret).filter(value=>value!==null),normalized=rows.map(row=>row.normalizedRegret).filter(value=>value!==null);
  const disagreements=rows.filter(row=>!row.topActionAgreement),familyCounts={};for(const row of disagreements)familyCounts[row.approxActionFamily]=(familyCounts[row.approxActionFamily]??0)+1;
  const pathological=disagreements.filter(row=>row.oracleRecommendationType!==row.approxRecommendationType&&(row.oracleRecommendationType!=='board_action'||row.approxRecommendationType!=='board_action'));
  const ratiosAggressive=rows.map(row=>row.runtimeRatioVsAggressive).filter(value=>Number.isFinite(value));
  return {
    cases:rows.length,agreements:rows.length-disagreements.length,agreementRate:rows.length?(rows.length-disagreements.length)/rows.length:0,
    disagreements:disagreements.length,meanRegret:regrets.reduce((sum,value)=>sum+value,0)/Math.max(regrets.length,1),
    medianRegret:percentile(regrets,.5),maxRegret:Math.max(0,...regrets),
    meanNormalizedRegret:normalized.reduce((sum,value)=>sum+value,0)/Math.max(normalized.length,1),
    meanKendallTau:rows.reduce((sum,row)=>sum+row.kendallTau,0)/Math.max(rows.length,1),
    meanAbsoluteUtilityError:rows.reduce((sum,row)=>sum+row.meanAbsoluteUtilityError,0)/Math.max(rows.length,1),
    maxAbsoluteUtilityError:Math.max(0,...rows.map(row=>row.maxAbsoluteUtilityError)),
    medianRuntimeRatioVsOracle:percentile(rows.map(row=>row.runtimeRatioVsOracle).filter(Number.isFinite),.5),
    medianRuntimeRatioVsAggressive:percentile(ratiosAggressive,.5),
    disagreementsAbove500:disagreements.filter(row=>row.oracleTopTwoGap>500).length,
    disagreementsAbove1000:disagreements.filter(row=>row.oracleTopTwoGap>1000).length,
    pathologicalStopMenuReversals:pathological.length,disagreementFamilyCounts:familyCounts,marginBins:marginSummary(rows),
  };
}

export function evaluateCalibrationGate(rows,requiredCases=12){
  const summary=summarizeComparisons(rows);
  const checks={
    complete:summary.cases===requiredCases,
    winnerAgreement:summary.agreements>=Math.ceil(requiredCases*11/12),
    maxRegret:summary.maxRegret<=500,
    disagreementsOnlyNearTie:summary.disagreementsAbove500===0,
    zeroLargeGapDisagreement:summary.disagreementsAbove1000===0,
    noPathologicalStopMenuReversal:summary.pathologicalStopMenuReversals===0,
    runtime:summary.medianRuntimeRatioVsAggressive!==null&&summary.medianRuntimeRatioVsAggressive<=0.80,
  };
  return {passed:Object.values(checks).every(Boolean),checks,summary,preferredOracleRuntimeTargetMet:summary.medianRuntimeRatioVsOracle!==null&&summary.medianRuntimeRatioVsOracle<=0.50};
}

export function selectWidestPassing(results){for(const id of M5D_WIDENING_ORDER)if(results[id]?.passed)return id;return null;}

export function evaluateCombinedHoldoutGate(rows,requiredCases=20){
  const summary=summarizeComparisons(rows),disagreements=rows.filter(row=>!row.topActionAgreement);
  const familyCounts=Object.values(summary.disagreementFamilyCounts),maxFamily=Math.max(0,...familyCounts),familyConcentration=disagreements.length>=2&&maxFamily/disagreements.length>0.75;
  const stopMenuBias=disagreements.some(row=>row.oracleRecommendationType!=='board_action'||row.approxRecommendationType!=='board_action');
  const checks={
    complete:summary.cases===requiredCases,
    agreement:summary.agreementRate>=0.95,
    maxRegret:summary.maxRegret<=500,
    zeroLargeGapDisagreement:summary.disagreementsAbove1000===0,
    meanNormalizedRegret:summary.meanNormalizedRegret<=0.05,
    noStopMenuBias:!stopMenuBias,
    noFamilyConcentration:!familyConcentration,
  };
  return {passed:Object.values(checks).every(Boolean),checks,summary,stopMenuBias,familyConcentration};
}

function proxySummary(rows){const n=rows.length,rate=limit=>n?rows.filter(row=>row.deepWinnerShallowRank<=limit).length/n:0;return{samples:n,pRank1:rate(1),pRankLe3:rate(3),pRankLe5:rate(5),pRankLe8:rate(8),pRankLe12:rate(12)};}
export function summarizeProxyObservations(observations,sampleLimitPerDepth){
  const grouped=new Map();for(const row of observations){const list=grouped.get(row.recursiveDepth)??[];list.push(row);grouped.set(row.recursiveDepth,list);}const byDepth={};for(const [depth,rows] of grouped)byDepth[String(depth)]=proxySummary(rows);
  return {sampleLimitPerDepth,observations:[...observations],overall:proxySummary(observations),byDepth};
}
