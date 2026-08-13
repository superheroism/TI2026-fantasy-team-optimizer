import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { M5C_EXPECTED_FIXTURES, M5C_FIDELITY_IDS } from './m5c-fixtures.mjs';
const fixtureName=process.argv[2],fixture=M5C_EXPECTED_FIXTURES.find(x=>x.name===fixtureName);if(!fixture)throw new Error(`Unknown fixture ${fixtureName}`);
const timeoutMs=Number(process.env.M5C_CASE_TIMEOUT_MS??60_000),worker=new URL('./benchmark-m5c-case.mjs',import.meta.url),runs=[];
for(const fidelityId of M5C_FIDELITY_IDS){const started=Date.now(),child=spawnSync(process.execPath,['--expose-gc',worker.pathname,fixtureName,'3',fidelityId],{encoding:'utf8',timeout:timeoutMs,maxBuffer:64*1024*1024}),elapsedMs=Date.now()-started;if(child.error?.code==='ETIMEDOUT'||child.signal){runs.push({fixture:fixtureName,horizon:3,fidelityId,status:'timeout',elapsedMs,timeoutMs});continue;}if(child.status!==0){runs.push({fixture:fixtureName,horizon:3,fidelityId,status:'error',elapsedMs,stderr:child.stderr?.slice(-4000)??''});continue;}try{runs.push({...JSON.parse(child.stdout.trim()),status:'completed',elapsedMs});}catch(error){runs.push({fixture:fixtureName,horizon:3,fidelityId,status:'error',elapsedMs,error:String(error)});}}
const jsonArg=process.argv.find(arg=>arg.startsWith('--json=')),jsonPath=jsonArg?.slice(7)??`m5c-${fixtureName}.json`;fs.writeFileSync(jsonPath,`${JSON.stringify({fixture:fixtureName,runs},null,2)}\n`);
