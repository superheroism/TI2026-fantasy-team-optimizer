import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { summarize, M6E_BASE_SHA } from './m6e-benchmark-lib.mjs';

const corpusPath='benchmarks/m6e-expanded-production-integration-fixtures.json',corpus=JSON.parse(fs.readFileSync(corpusPath,'utf8'));
if(process.versions.node.split('.')[0]!=='22')throw new Error(`M6E authoritative benchmark requires Node 22; got ${process.version}`);
const run=(definition,mode)=>{const child=spawnSync(process.execPath,['--expose-gc','scripts/benchmark-m6e-case.mjs',corpusPath,definition.id,mode],{encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024});if(child.status!==0)throw new Error(`${definition.id}/${mode} failed: ${child.stderr||child.stdout}`);return JSON.parse(child.stdout.trim()).result;};
const pairs=[];
for(const definition of corpus.cases){process.stderr.write(`M6E ${definition.id}: exact...\n`);const exact=run(definition,'exact');process.stderr.write(`M6E ${definition.id}: production...\n`);const production=run(definition,'production');pairs.push({definition,exact,production});}
const summary=summarize(pairs),acceptance={buildTestsGreen:true,legacyBehavioralRegressions:0,expandedT2RootAgreementRequired:1,maximumExpectedScoreRegretAllowed:0,maximumTargetProbabilityRegretAllowed:0,minimumMaterialMedianSpeedup:1.5};
const gates={rootAgreement:summary.rootActionAgreement===1,expectedScoreRegret:summary.maximumExpectedScoreRegret<=1e-12,targetProbabilityRegret:summary.maximumTargetProbabilityRegret<=1e-12,materialPerformance:summary.medianSpeedup>=acceptance.minimumMaterialMedianSpeedup};
const artifact={m6eBaseSha:M6E_BASE_SHA,generatedAt:new Date().toISOString(),environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model??'unknown',totalMemoryGiB:os.totalmem()/1024**3},corpus:{path:corpusPath,cases:corpus.cases.length,layoutId:corpus.layoutId,horizon:corpus.horizon},acceptance,gates,summary,raw:pairs};
fs.writeFileSync('benchmarks/m6e-production-integration-results.json',`${JSON.stringify(artifact,null,2)}\n`);
const report=`# M6E Production Benchmark Report\n\n- Base SHA: \`${M6E_BASE_SHA}\`\n- Node: ${process.version}\n- Cases: ${summary.cases}\n- Root-action agreement vs exact: ${(100*summary.rootActionAgreement).toFixed(1)}%\n- Maximum expected-score regret: ${summary.maximumExpectedScoreRegret}\n- Maximum target-probability regret: ${summary.maximumTargetProbabilityRegret}\n- Median production runtime: ${summary.medianRuntimeMs?.toFixed(1)} ms\n- Median speedup vs exact: ${summary.medianSpeedup?.toFixed(2)}x\n- P90 speedup vs exact: ${summary.p90Speedup?.toFixed(2)}x\n- Median structural work avoided: ${(100*(summary.medianStructuralWorkAvoided??0)).toFixed(1)}%\n- Exact-fallback rate: ${(100*summary.exactFallbackRate).toFixed(1)}%\n- Stage distribution: K2 ${(100*summary.stageDistribution.k2).toFixed(1)}%, K4 ${(100*summary.stageDistribution.k4).toFixed(1)}%, K6 ${(100*summary.stageDistribution.k6).toFixed(1)}%, exact ${(100*summary.stageDistribution.exact).toFixed(1)}%\n- Maximum production RSS: ${summary.maxRSSMiB.toFixed(1)} MiB\n\nAcceptance gates: ${Object.values(gates).every(Boolean)?'PASS':'FAIL'}.\n`;
fs.writeFileSync('benchmarks/m6e-production-integration-report.md',report);
console.log(report);
if(!Object.values(gates).every(Boolean))process.exitCode=1;
