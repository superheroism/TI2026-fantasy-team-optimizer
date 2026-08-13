import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const fixtures=['default','quality-heavy','stat-heavy','trait-heavy','global-quality'];
const fixture=process.argv[2];if(!fixtures.includes(fixture))throw new Error(`Unknown t4 fixture ${fixture}`);
const timeoutMs=Number(process.env.M5C_CASE_TIMEOUT_MS??60_000),worker=new URL('./benchmark-m5c-case.mjs',import.meta.url),started=Date.now();
const child=spawnSync(process.execPath,['--expose-gc',worker.pathname,fixture,'4','aggressive'],{encoding:'utf8',timeout:timeoutMs,maxBuffer:64*1024*1024});
const elapsedMs=Date.now()-started;let run;
if(child.error?.code==='ETIMEDOUT'||child.signal)run={fixture,horizon:4,fidelityId:'aggressive',status:'timeout',elapsedMs,timeoutMs,signal:child.signal??null};
else if(child.status!==0)run={fixture,horizon:4,fidelityId:'aggressive',status:'error',elapsedMs,exitCode:child.status,stderr:child.stderr?.slice(-4000)??''};
else try{run={...JSON.parse(child.stdout.trim()),status:'completed',elapsedMs};}catch(error){run={fixture,horizon:4,fidelityId:'aggressive',status:'error',elapsedMs,error:String(error),stdout:child.stdout?.slice(-4000)??''};}
const jsonArg=process.argv.find(arg=>arg.startsWith('--json=')),jsonPath=jsonArg?.slice(7)??`m5c-t4-${fixture}.json`;fs.writeFileSync(jsonPath,`${JSON.stringify(run,null,2)}\n`);
