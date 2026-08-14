import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { compareTargetRuns, evaluateM5EGate } from './m5e-benchmark-lib.mjs';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const worker=fileURLToPath(new URL('./benchmark-m5e-target-case.mjs',import.meta.url));
const reportPath=path.join(root,'benchmarks','m5e-target-probability-feasibility.json');
const targetScore=55_000,menuIds=['green-stat-all','red-quality-all','blue-trait-all'];
const cases=[
  {id:'t2-current',horizon:2,fidelityId:'current',wideningId:'none',timeoutMs:120_000,purpose:'Baseline t=2 target sanity.'},
  {id:'t2-aggressive-wide',horizon:2,fidelityId:'aggressive',wideningId:'wide',timeoutMs:120_000,purpose:'Verify M5C/M5D options are structurally ignored at t<=2.'},
  {id:'t3-current-oracle',horizon:3,fidelityId:'current',wideningId:'none',timeoutMs:600_000,purpose:'Current-fidelity exact reference policy.'},
  {id:'t3-aggressive-only',horizon:3,fidelityId:'aggressive',wideningId:'none',timeoutMs:600_000,purpose:'Diagnostic isolation of M5C continuation compression.'},
  {id:'t3-aggressive-wide',horizon:3,fidelityId:'aggressive',wideningId:'wide',timeoutMs:60_000,purpose:'Selected M5D feasibility policy.'},
];

if(process.argv.includes('--plan')){
  console.log(JSON.stringify({
    package:'M5E target-probability t=3 feasibility',objective:'target_probability',targetScore,menuIds,tokensRemaining:10,
    productionHorizon:2,continuationSchedule:[4,2,1],wideningSchedule:[12,8,4],materialRuntimeImprovementRatioCeiling:0.80,
    cases,authoritativeRunner:'GitHub Actions / ubuntu-latest / Node 22',profilerOverhead:false,
  },null,2));
  process.exit(0);
}

const preflightPassed=process.argv.includes('--preflight-passed');
const runnerCommit=(()=>{try{return execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();}catch{return null;}})();
const runtime={node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model??null,logicalCpus:os.cpus().length,totalMemoryBytes:os.totalmem()};

function runCase(spec,index){
  console.log(`[M5E] ${index}/${cases.length}: ${spec.id} | t=${spec.horizon} | ${spec.fidelityId} | ${spec.wideningId} | timeout=${spec.timeoutMs}ms`);
  const started=Date.now();
  const child=spawnSync(process.execPath,['--expose-gc',worker,spec.id,String(spec.horizon),spec.fidelityId,spec.wideningId],{
    cwd:root,encoding:'utf8',timeout:spec.timeoutMs,maxBuffer:128*1024*1024,
  });
  const elapsedMs=Date.now()-started;
  if(child.error?.code==='ETIMEDOUT'||child.signal){
    return {...spec,status:'timeout',elapsedMs,timeoutMs:spec.timeoutMs,signal:child.signal??null,stderr:child.stderr?.slice(-4000)??''};
  }
  if(child.status!==0){
    return {...spec,status:'error',elapsedMs,timeoutMs:spec.timeoutMs,exitCode:child.status,stderr:child.stderr?.slice(-8000)??'',stdout:child.stdout?.slice(-4000)??''};
  }
  try{return {...JSON.parse(child.stdout.trim()),status:'completed',elapsedMs,timeoutMs:spec.timeoutMs,purpose:spec.purpose};}
  catch(error){return {...spec,status:'error',elapsedMs,timeoutMs:spec.timeoutMs,error:String(error),stdout:child.stdout?.slice(-8000)??''};}
}

const runs=cases.map((spec,index)=>runCase(spec,index+1));
const byId=new Map(runs.map(run=>[run.id,run]));
const oracle=byId.get('t3-current-oracle'),candidate=byId.get('t3-aggressive-wide'),aggressiveOnly=byId.get('t3-aggressive-only');
const comparison=compareTargetRuns(oracle,candidate);
const aggressiveOnlyComparison=compareTargetRuns(oracle,aggressiveOnly);
const generatedAt=new Date().toISOString();
let report={
  generatedAt,package:'M5E target-probability t=3 feasibility',runnerCommit,runtime,preflightPassed,
  authoritativeIntent:'Same-job isolated Node processes on GitHub Actions; profiler overhead excluded from timed cases.',
  productionHorizon:2,
  frozenExperiment:{objective:'target_probability',targetScore,menuIds,tokensRemaining:10,menuRerollAvailable:true,modeledHorizon:3,continuationSchedule:[4,2,1],wideningSchedule:[12,8,4],materialRuntimeImprovementRatioCeiling:0.80},
  timeouts:{t2Ms:120_000,t3OracleMs:600_000,t3AggressiveDiagnosticMs:600_000,t3CandidateMs:60_000},
  expectedScoreDiagnosticMeaning:'Existing ActionEvaluation expectedFinalScore is retained as a secondary diagnostic; target probability is the search utility and menu-comparison utility.',
  cases,runs,comparison,aggressiveOnlyComparison,
};
report={...report,gate:evaluateM5EGate(report)};
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
fs.writeFileSync(reportPath,`${JSON.stringify(report,null,2)}\n`);

const executionErrors=runs.filter(run=>run.status==='error');
console.log('\n[M5E] FINAL');
console.log(JSON.stringify({
  outcome:report.gate.outcome,gatePassed:report.gate.passed,preflightPassed,
  oracleStatus:oracle?.status??null,candidateStatus:candidate?.status??null,
  oracleRecommendation:oracle?.recommendationKey??null,candidateRecommendation:candidate?.recommendationKey??null,
  oracleRuntimeMs:oracle?.runtimeMs??oracle?.elapsedMs??null,candidateRuntimeMs:candidate?.runtimeMs??candidate?.elapsedMs??null,
  comparison,report:'benchmarks/m5e-target-probability-feasibility.json',executionErrors:executionErrors.length,
},null,2));
if(executionErrors.length)process.exitCode=2;
