import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

export const M7B_BASE_SHA='aa8a880905859f94c4865d7b7a17adb61ad7376c';
if(process.versions.node.split('.')[0]!=='22')throw new Error(`M7B authoritative benchmark requires Node 22; got ${process.version}`);
const definitions=[];
for(const layoutId of ['legacy_3','expanded_5'])for(const objective of ['expected_score','target_probability'])for(const tokens of [1,2])definitions.push({layoutId,objective,tokens,id:`${layoutId}-${objective}-t${tokens}`});
const results=[];
for(const definition of definitions){
  process.stderr.write(`M7B ${definition.id}...\n`);
  const child=spawnSync(process.execPath,['--expose-gc','scripts/benchmark-m7b-v1-case.mjs',definition.layoutId,definition.objective,String(definition.tokens)],{encoding:'utf8',timeout:300000,maxBuffer:64*1024*1024});
  if(child.status!==0)throw new Error(`${definition.id} failed: ${child.stderr||child.stdout}`);
  results.push(JSON.parse(child.stdout.trim()));
}
const routeChecks=results.map(row=>({id:row.id,pass:row.modeledHorizon===row.tokens&&(row.layoutId==='expanded_5'&&row.tokens===2?row.searchMode.startsWith('expanded_t2_adaptive'):row.searchMode==='exact')}));
const artifact={
  milestone:'M7B',baseSha:M7B_BASE_SHA,generatedAt:new Date().toISOString(),
  environment:{node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,cpuModel:os.cpus()[0]?.model??'unknown',totalMemoryGiB:os.totalmem()/1024**3},
  contract:{productionModeledHorizonMax:2,layouts:['legacy_3','expanded_5'],objectives:['expected_score','target_probability']},
  routeChecks,allRouteChecksPass:routeChecks.every(x=>x.pass),results
};
fs.writeFileSync('benchmarks/m7b-v1-production-baseline.json',`${JSON.stringify(artifact,null,2)}\n`);
console.log(JSON.stringify(artifact,null,2));
if(!artifact.allRouteChecksPass)process.exitCode=1;
