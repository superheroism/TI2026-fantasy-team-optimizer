import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const outputArg=process.argv.find(x=>x.startsWith('--json='));
const outputPath=outputArg?.slice(7)??'benchmarks/m6b-expanded-frontier-baseline.json';
const worker=new URL('./benchmark-m6b-frontier-case.mjs',import.meta.url);
const timeoutMs=Number(process.env.M6B_CASE_TIMEOUT_MS??240_000);
const runs=[];
const matrix=[
  ['legacy_3','stat_heavy',1],['expanded_5','stat_heavy',1],
  ['legacy_3','stat_heavy',2],['expanded_5','stat_heavy',2],
  ['legacy_3','quality_heavy',2],['expanded_5','quality_heavy',2],
  ['legacy_3','trait_heavy',2],['expanded_5','trait_heavy',2],
  ['legacy_3','global_quality',2],['expanded_5','global_quality',2],
  ['legacy_3','target_probability',2],['expanded_5','target_probability',2],
];

for(const [layoutId,caseName,horizon] of matrix){
  const child=spawnSync(process.execPath,['--expose-gc',worker.pathname,layoutId,caseName,String(horizon)],{encoding:'utf8',timeout:timeoutMs,maxBuffer:256*1024*1024});
  if(child.error?.code==='ETIMEDOUT'||child.signal){runs.push({layoutId,case:caseName,horizon,status:'timeout',timeoutMs,signal:child.signal??null});continue;}
  if(child.status!==0){runs.push({layoutId,case:caseName,horizon,status:'error',exitCode:child.status,stderr:(child.stderr??'').slice(-12000)});continue;}
  try{runs.push({...JSON.parse(child.stdout.trim()),status:'completed'});}catch(error){runs.push({layoutId,case:caseName,horizon,status:'error',error:String(error),stdout:(child.stdout??'').slice(-12000)});}
}

const pairs=[];
for(const [caseName,horizon] of [['stat_heavy',1],['stat_heavy',2],['quality_heavy',2],['trait_heavy',2],['global_quality',2],['target_probability',2]]){
  const legacy=runs.find(x=>x.layoutId==='legacy_3'&&x.case===caseName&&x.horizon===horizon);
  const expanded=runs.find(x=>x.layoutId==='expanded_5'&&x.case===caseName&&x.horizon===horizon);
  const ratio=(fn)=>legacy?.status==='completed'&&expanded?.status==='completed'?fn(expanded)/Math.max(fn(legacy),1e-12):null;
  pairs.push({
    case:caseName,horizon,legacyStatus:legacy?.status??'missing',expandedStatus:expanded?.status??'missing',
    optimizerRuntimeRatioExpandedVsLegacy:ratio(x=>x.optimizer.runtimeMs),
    terminalStateRatioExpandedVsLegacy:ratio(x=>x.frontier.uniqueTerminalBoards),
    vCallRatioExpandedVsLegacy:ratio(x=>x.frontier.vCalls),
    transitionPathRatioExpandedVsLegacy:ratio(x=>x.frontier.aggregatedTransitionOutcomes),
    targetScenarioCheckRatioExpandedVsLegacy:caseName==='target_probability'?ratio(x=>x.frontier.targetScenarioChecks):null,
    legacy,expanded,
  });
}

const completed=runs.filter(x=>x.status==='completed');
const report={
  generatedAt:new Date().toISOString(),
  m6bBaseSha:'a3505bbd25d7cac47d115452b924a2f3f8eda4ae',
  phase:'baseline',
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  production:{layoutId:'legacy_3',maxModeledHorizon:2,expandedDefault:false},
  semantics:{newSearchApproximation:false,m5hHoldoutConsumed:false,targetT3Run:false,targetT4Run:false,scenarioFidelityChanged:false},
  timeoutMs,runs,pairs,
  summary:{completed:completed.length,timeouts:runs.filter(x=>x.status==='timeout').length,errors:runs.filter(x=>x.status==='error').length},
};
fs.writeFileSync(outputPath,`${JSON.stringify(report,null,2)}\n`);
console.log(JSON.stringify({outputPath,summary:report.summary,pairs:pairs.map(({case:caseName,horizon,optimizerRuntimeRatioExpandedVsLegacy,terminalStateRatioExpandedVsLegacy,vCallRatioExpandedVsLegacy,transitionPathRatioExpandedVsLegacy,targetScenarioCheckRatioExpandedVsLegacy})=>({case:caseName,horizon,optimizerRuntimeRatioExpandedVsLegacy,terminalStateRatioExpandedVsLegacy,vCallRatioExpandedVsLegacy,transitionPathRatioExpandedVsLegacy,targetScenarioCheckRatioExpandedVsLegacy}))}));
