import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const port=4173;
const server=spawn('python3',['-m','http.server',String(port),'--directory','docs'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
  await sleep(700);
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-precise-memory-info','--js-flags=--expose-gc']});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});
  const cases=[
    {id:'legacy-expected',layout:'legacy_3',objective:'expected_score',operationIds:['green-stat-all','red-quality-all','blue-trait-all']},
    {id:'legacy-target',layout:'legacy_3',objective:'target_probability',targetScore:65000,operationIds:['green-stat-all','red-quality-all','blue-trait-all']},
    {id:'expanded-expected',layout:'expanded_5',variant:'quality_inverted',objective:'expected_score',operationIds:['quality-increase-one','red-quality-all','green-quality-all']},
    {id:'expanded-target',layout:'expanded_5',variant:'baseline',objective:'target_probability',targetScore:79500,operationIds:['blue-stat-all','quality-increase-one','green-trait-all']},
    {id:'expanded-exact-fallback',layout:'expanded_5',variant:'baseline',objective:'expected_score',operationIds:['red-stat-all','green-stat-all','blue-stat-all'],expectFallback:true},
  ];
  const result=await page.evaluate(async cases=>{
    const [{OptimizerWorkerClient},{defaultBoard},{ACTION_BY_ID,cloneAction},{BOARD_LAYOUTS}]=await Promise.all([
      import('/js/ui/optimizerClient.js'),import('/js/data/defaultState.js'),import('/js/data/actionCatalog.js'),import('/js/domain/rules.js')
    ]);
    const roles=['core','mid','support'];
    function expandedBoard(variant='baseline'){
      const board=structuredClone(defaultBoard);board.layoutId='expanded_5';
      const extra={core:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Deaths',qualityTier:4,trait:'Unique'}],mid:[{stat:'GPM',qualityTier:2,trait:'Friendly'},{stat:'Stuns',qualityTier:4,trait:'Unique'}],support:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Smokes Used',qualityTier:4,trait:'Unique'}]};
      for(const role of roles){const slots=BOARD_LAYOUTS.expanded_5.roles[role],first=board[role].emblems.map((e,i)=>({...e,id:`${role}-${i}`,position:i,color:slots[i].color}));board[role].emblems=[...first,...extra[role].map((e,j)=>({id:`${role}-${j+3}`,position:j+3,color:slots[j+3].color,...e}))];}
      if(variant==='repeat_permuted'||variant==='repeat_permuted_low'){const p={core:[4,3,0,1,2],mid:[3,1,4,0,2],support:[4,3,0,1,2]};for(const role of roles){const old=board[role].emblems.map(x=>({...x}));board[role].emblems=p[role].map((source,i)=>({...old[source],id:`${role}-${i}`,position:i,color:BOARD_LAYOUTS.expanded_5.roles[role][i].color}));}}
      const tiers=variant==='quality_inverted'?[5,1,2,4,3]:variant==='quality_capped'?[5,5,4,5,4]:variant==='repeat_permuted_low'?[1,2,1,2,3]:null;if(tiers)for(const role of roles)board[role].emblems=board[role].emblems.map((e,i)=>({...e,qualityTier:tiers[i]}));
      return board;
    }
    function stateOf(def){const menu=def.operationIds.map(id=>cloneAction(ACTION_BY_ID.get(id)));return {board:def.layout==='expanded_5'?expandedBoard(def.variant):structuredClone(defaultBoard),tokensRemaining:2,menu,menuRerollAvailable:true,username:`M6F browser ${def.id}`,objective:def.objective,...(def.targetScore?{targetScore:def.targetScore}:{})};}
    const observations=[];
    const longTasks=[];let observer;
    if(typeof PerformanceObserver!=='undefined'){try{observer=new PerformanceObserver(list=>{for(const e of list.getEntries())longTasks.push({start:e.startTime,duration:e.duration});});observer.observe({entryTypes:['longtask']});}catch{}}
    const heap=()=>performance.memory?.usedJSHeapSize??null;
    async function collect(client,state,label){
      longTasks.length=0;const before=heap(),samples=[];const sampler=setInterval(()=>samples.push(heap()),10);const started=performance.now();const run=await client.optimize(state);const wall=performance.now()-started;clearInterval(sampler);await new Promise(r=>setTimeout(r,0));const after=heap();
      return {label,wallMs:wall,optimizerWallMs:run.optimizerWallMs,transferRoundTripMs:run.transferRoundTripMs,mainThreadLongTaskMs:longTasks.reduce((s,x)=>s+x.duration,0),maxLongTaskMs:longTasks.length?Math.max(...longTasks.map(x=>x.duration)):0,heapBefore:before,heapPeak:samples.filter(Number.isFinite).length?Math.max(...samples.filter(Number.isFinite)):null,heapAfter:after,payloadBytes:new TextEncoder().encode(JSON.stringify(state)).byteLength,searchMode:run.diagnostics.searchMode,adaptiveFallbacks:run.diagnostics.adaptiveRefinement?.fallbacks??0,policyId:run.diagnostics.adaptiveRefinement?.policyId??null};
    }
    for(const def of cases){
      const state=stateOf(def),client=new OptimizerWorkerClient();
      const cold=await collect(client,state,'cold');const warm=await collect(client,state,'warm');
      const repeated=[];for(let i=0;i<3;i++)repeated.push(await collect(client,state,`repeat-${i+1}`));
      const retainedStart=repeated[0].heapAfter,retainedEnd=repeated.at(-1).heapAfter;
      observations.push({caseId:def.id,layout:def.layout,objective:def.objective,expectFallback:!!def.expectFallback,cold,warm,repeatedRunHeapGrowthBytes:Number.isFinite(retainedStart)&&Number.isFinite(retainedEnd)?retainedEnd-retainedStart:null});
      client.dispose();
    }
    observer?.disconnect();return observations;
  },cases);
  await browser.close();
  const artifact={m6fBaseSha:'cf03a20e601242810e4101415eb4989a8cae646c',capturedAt:new Date().toISOString(),runtime:{node:process.version,chrome},measurementNotes:['mainThreadLongTaskMs uses the browser Long Tasks API; optimizer computation occurs in the worker','performance.memory measures the page isolate and may not include the worker isolate; worker wall time is reported separately','cold uses a newly constructed worker client; warm and repeat runs reuse the same worker/model load'],cases:result};
  fs.writeFileSync('benchmarks/m6f-browser-performance.json',JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify(artifact,null,2));
}finally{server.kill('SIGTERM');}
