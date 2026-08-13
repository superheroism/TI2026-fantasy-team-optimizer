import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const cases=['default','quality_heavy','stat_heavy','trait_heavy','global_quality','target_55k'];
const horizons=[2,3,4];
const timeoutMs=Number(process.env.M5_CASE_TIMEOUT_MS??120_000);
const jsonArg=process.argv.find(arg=>arg.startsWith('--json='));
const jsonPath=jsonArg?.slice('--json='.length)??'benchmarks/m5-four-token-experiment.json';
const worker=new URL('./benchmark-m5-case.mjs',import.meta.url);
const runs=[];

for(const caseName of cases){
  for(const horizon of horizons){
    process.stdout.write(`M5A ${caseName.padEnd(14)} t=${horizon} ... `);
    const started=Date.now();
    const child=spawnSync(process.execPath,['--expose-gc',worker.pathname,caseName,String(horizon)],{
      encoding:'utf8',timeout:timeoutMs,maxBuffer:64*1024*1024,
    });
    const elapsedMs=Date.now()-started;
    if(child.error?.code==='ETIMEDOUT'||child.signal){
      const row={case:caseName,horizon,status:'timeout',elapsedMs,timeoutMs,signal:child.signal??null};
      runs.push(row);console.log(`TIMEOUT (${(elapsedMs/1000).toFixed(1)}s)`);continue;
    }
    if(child.status!==0){
      const row={case:caseName,horizon,status:'error',elapsedMs,exitCode:child.status,stderr:child.stderr?.slice(-4000)??''};
      runs.push(row);console.log(`ERROR exit=${child.status}`);continue;
    }
    try{
      const parsed=JSON.parse(child.stdout.trim());
      runs.push({...parsed,status:'completed',elapsedMs});
      console.log(`${parsed.cold.runtimeMs.toFixed(1)} ms cold; ${parsed.cold.recommendation}`);
    }catch(error){
      runs.push({case:caseName,horizon,status:'error',elapsedMs,error:String(error),stdout:child.stdout?.slice(-4000)??''});
      console.log('ERROR parsing worker output');
    }
  }
}

const byCase={};
for(const caseName of cases){
  const rows=runs.filter(row=>row.case===caseName);
  const t2=rows.find(row=>row.horizon===2&&row.status==='completed');
  byCase[caseName]=rows.map(row=>{
    if(row.status!=='completed')return row;
    const multiplier=t2?row.cold.runtimeMs/Math.max(t2.cold.runtimeMs,1e-9):null;
    return {...row,runtimeMultiplierVsT2:multiplier};
  });
}

const policyStability={};
for(const [caseName,rows] of Object.entries(byCase)){
  policyStability[caseName]=rows.map(row=>row.status==='completed'?{
    horizon:row.horizon,recommendation:row.cold.recommendation,utility:row.cold.utility,
    runnerUp:row.cold.runnerUp,
  }:{horizon:row.horizon,status:row.status});
}

const report={
  generatedAt:new Date().toISOString(),
  runtime:{node:process.version,platform:process.platform,arch:process.arch},
  timeoutMs,
  semantics:{productionDefaultTokens:2,experimentalHorizons:horizons,approximationsIntroduced:false},
  runs,
  byCase,
  policyStability,
};
fs.writeFileSync(jsonPath,`${JSON.stringify(report,null,2)}\n`);
console.log(`Wrote M5A benchmark report to ${jsonPath}`);
