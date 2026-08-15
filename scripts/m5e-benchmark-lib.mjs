const EPSILON=1e-12;

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

export function kendallTau(oracle,approx){
  const a=new Map(oracle.map((row,index)=>[row.key,index])),b=new Map(approx.map((row,index)=>[row.key,index]));
  const keys=[...a.keys()].filter(key=>b.has(key));let concordant=0,discordant=0;
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const left=Math.sign(a.get(keys[i])-a.get(keys[j])),right=Math.sign(b.get(keys[i])-b.get(keys[j]));
    if(left===right)concordant++;else discordant++;
  }
  return concordant+discordant?(concordant-discordant)/(concordant+discordant):1;
}

export function rankedTablesEquivalent(left,right,tolerance=EPSILON){
  if(!left||!right||left.length!==right.length)return false;
  for(let i=0;i<left.length;i++){
    const a=left[i],b=right[i];
    if(a.key!==b.key)return false;
    if(Math.abs(a.utility-b.utility)>tolerance)return false;
    if(Math.abs(a.expectedScore-b.expectedScore)>tolerance)return false;
  }
  return true;
}

function rowByKey(run,key){return run?.ranking?.find(row=>row.key===key);}

export function compareTargetRuns(oracle,approx){
  if(!oracle||!approx||oracle.status!=='completed'||approx.status!=='completed')return null;
  const chosen=rowByKey(oracle,approx.recommendationKey);
  const oracleTopTwoGap=oracle.ranking[1]?oracle.ranking[0].utility-oracle.ranking[1].utility:0;
  const oracleRegret=chosen===undefined?null:oracle.utility-chosen.utility;
  const oracleTop3=new Set(oracle.ranking.slice(0,3).map(row=>row.key));
  const approxTop3=approx.ranking.slice(0,3).map(row=>row.key);
  const stopDeltaOracle=(rowByKey(oracle,'stop')?.utility??-Infinity)-(rowByKey(oracle,'menu_reroll')?.utility??-Infinity);
  const stopDeltaApprox=(rowByKey(approx,'stop')?.utility??-Infinity)-(rowByKey(approx,'menu_reroll')?.utility??-Infinity);
  return {
    topActionAgreement:oracle.recommendationKey===approx.recommendationKey,
    oracleBestKey:oracle.recommendationKey,
    approxBestKey:approx.recommendationKey,
    oracleTopTwoGap,
    oracleTopTwoGapPercentagePoints:oracleTopTwoGap*100,
    oracleRegret,
    oracleRegretPercentagePoints:oracleRegret===null?null:oracleRegret*100,
    kendallTau:kendallTau(oracle.ranking,approx.ranking),
    top3OverlapCount:approxTop3.filter(key=>oracleTop3.has(key)).length,
    top3OverlapFraction:approxTop3.filter(key=>oracleTop3.has(key)).length/3,
    stopMenuOrderReversed:Number.isFinite(stopDeltaOracle)&&Number.isFinite(stopDeltaApprox)&&Math.sign(stopDeltaOracle)!==Math.sign(stopDeltaApprox),
    actionFamilyAgreement:actionFamily(oracle.recommendationKey)===actionFamily(approx.recommendationKey),
    oracleActionFamily:actionFamily(oracle.recommendationKey),
    approxActionFamily:actionFamily(approx.recommendationKey),
    runtimeRatioVsOracle:approx.runtimeMs/oracle.runtimeMs,
  };
}

function completed(run){return run?.status==='completed';}
function sameArray(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function hasStopAndMenu(run){return !!rowByKey(run,'stop')&&!!rowByKey(run,'menu_reroll');}

export function evaluateM5EGate(report){
  const runs=Object.fromEntries((report.runs??[]).map(run=>[run.id,run]));
  const t2Current=runs['t2-current'],t2Options=runs['t2-aggressive-wide'];
  const oracle=runs['t3-current-oracle'],candidate=runs['t3-aggressive-wide'];
  const comparison=report.comparison??compareTargetRuns(oracle,candidate);
  const t2Equivalent=completed(t2Current)&&completed(t2Options)&&rankedTablesEquivalent(t2Current.ranking,t2Options.ranking);
  const allCompletedTargetFixed=(report.runs??[]).filter(completed).every(run=>run.targetScore===55_000);
  const allCompletedMenuFixed=(report.runs??[]).filter(completed).every(run=>sameArray(run.menuIds,['green-stat-all','red-quality-all','blue-trait-all']));
  const t2OptionsIgnored=completed(t2Options)
    &&t2Options.engineDiagnostics?.continuationFidelity?.id==='current'
    &&t2Options.engineDiagnostics?.actionWidening?.enabled===false;
  const oraclePolicy=completed(oracle)&&oracle.fidelityId==='current'&&oracle.wideningId==='none'
    &&oracle.engineDiagnostics?.continuationFidelity?.id==='current'
    &&oracle.engineDiagnostics?.actionWidening?.enabled===false;
  const candidatePolicy=completed(candidate)
    &&candidate.fidelityId==='aggressive'&&candidate.wideningId==='wide'
    &&candidate.engineDiagnostics?.continuationFidelity?.id==='aggressive'
    &&sameArray(candidate.engineDiagnostics?.continuationFidelity?.freshMenuOutcomeStrataByDepth,[4,2,1])
    &&candidate.engineDiagnostics?.actionWidening?.policyId==='wide'
    &&sameArray(candidate.engineDiagnostics?.actionWidening?.deepOperationCapsByDepth,[12,8,4]);
  const operationIds=candidate?.futureOperationIds??[];
  const uniqueOperationIds=new Set(operationIds);
  const checks={
    preflightPassed:report.preflightPassed===true,
    t2RankedTableEquivalent:t2Equivalent,
    t2ExperimentalOptionsIgnored:t2OptionsIgnored,
    productionHorizonUnchanged:report.productionHorizon===2,
    targetFixedAt55k:allCompletedTargetFixed,
    defaultMenuFixed:allCompletedMenuFixed,
    oraclePolicyExact:oraclePolicy,
    oracleCompletedWithin600s:completed(oracle)&&oracle.runtimeMs<=600_000,
    candidatePolicyFrozen:candidatePolicy,
    candidateWinnerMatchesOracle:comparison?.topActionAgreement===true,
    candidateCompletedUnder60s:completed(candidate)&&candidate.runtimeMs<60_000,
    candidateMateriallyFaster:comparison!==null&&comparison.runtimeRatioVsOracle<=0.80,
    candidateMemoryHealthy:completed(candidate)&&Number.isFinite(candidate.memory?.end?.rss)&&Number.isFinite(candidate.memory?.maxRssEndKb),
    stopAndMenuRetained:hasStopAndMenu(oracle)&&hasStopAndMenu(candidate),
    all20FutureOperationIdentitiesRepresented:operationIds.length===20&&uniqueOperationIds.size===20,
  };
  return {outcome:Object.values(checks).every(Boolean)?'A':'B',passed:Object.values(checks).every(Boolean),checks,t2Equivalent,comparison};
}