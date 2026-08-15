import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const outputArg=process.argv.find(x=>x.startsWith('--json='));
const outputPath=outputArg?.slice(7)??'benchmarks/m6a-layout-comparison.json';
const worker=new URL('./benchmark-m6a-layout-case.mjs',import.meta.url);
const timeoutMs=Number(process.env.M6A_CASE_TIMEOUT_MS??180_000);
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
  const child=spawnSync(process.execPath,['--expose-gc',worker.pathname,layoutId,caseName,String(horizon)],{encoding:'utf8',timeout:timeoutMs,maxBuffer:128*1024*1024});
  if(child.error?.code==='ETIMEDOUT'||child.signal){runs.push({layoutId,case:caseName,horizon,status:'timeout',timeoutMs,signal:child.signal??null});continue;}
  if(child.status!==0){runs.push({layoutId,case:caseName,horizon,status:'error',exitCode:child.status,stderr:(child.stderr??'').slice(-8000)});continue;}
  try{runs.push({...JSON.parse(child.stdout.trim()),status:'completed'});}catch(error){runs.push({layoutId,case:caseName,horizon,status:'error',error:String(error),stdout:(child.stdout??'').slice(-8000)});}
}

const pairs=[];
for(const [caseName,horizon] of [['stat_heavy',1],['stat_heavy',2],['quality_heavy',2],['trait_heavy',2],['global_quality',2],['target_probability',2]]){
  const legacy=runs.find(x=>x.layoutId==='legacy_3'&&x.case===caseName&&x.horizon===horizon);
  const expanded=runs.find(x=>x.layoutId==='expanded_5'&&x.case===caseName&&x.horizon===horizon);
  const ratio=(a,b)=>a?.status==='completed'&&b?.status==='completed'?b.optimizer.runtimeMs/Math.max(a.optimizer.runtimeMs,1e-9):null;
  pairs.push({case:caseName,horizon,legacyStatus:legacy?.status??'missing',expandedStatus:expanded?.status??'missing',optimizerRuntimeRatioExpandedVsLegacy:ratio(legacy,expanded),legacy,expanded});
}

const completed=runs.filter(x=>x.status==='completed');
const report={
  generatedAt:new Date().toISOString(),
  baseSha:'b058010829d7b48c5968d2540acf65a40b64f2a7',
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  production:{layoutId:'legacy_3',maxModeledHorizon:2,expandedDefault:false},
  semantics:{newSearchApproximation:false,m5hHoldoutConsumed:false,targetT3Run:false,targetT4Run:false},
  timeoutMs,
  runs,pairs,
  summary:{completed:completed.length,timeouts:runs.filter(x=>x.status==='timeout').length,errors:runs.filter(x=>x.status==='error').length},
};
fs.writeFileSync(outputPath,`${JSON.stringify(report,null,2)}\n`);
console.log(`Wrote ${outputPath}`);
