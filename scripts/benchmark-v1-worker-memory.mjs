import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const port=4173;
const requestCount=Number(process.env.SOAK_REQUESTS||24);
const server=spawn('python3',['-m','http.server',String(port),'--directory','docs'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const median=values=>{const xs=[...values].sort((a,b)=>a-b);const n=xs.length;return n?xs[Math.floor(n/2)]:null;};

try{
  await sleep(700);
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-precise-memory-info']});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});

  const pageSession=await page.target().createCDPSession();
  let workerSessionId=null,workerTargetUrl=null,workerGeneration=0,commandSequence=0;
  let profilerGeneration=0;
  const pendingCommands=new Map();
  pageSession.on('Target.attachedToTarget',event=>{
    if(event.targetInfo.type==='worker'&&event.targetInfo.url.includes('optimizer.worker')){
      workerSessionId=event.sessionId;workerTargetUrl=event.targetInfo.url;workerGeneration++;profilerGeneration=0;
    }
  });
  pageSession.on('Target.detachedFromTarget',event=>{
    if(event.sessionId===workerSessionId){workerSessionId=null;profilerGeneration=0;}
  });
  pageSession.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==workerSessionId)return;
    let message;try{message=JSON.parse(event.message);}catch{return;}
    if(!message.id)return;
    const pending=pendingCommands.get(message.id);if(!pending)return;
    pendingCommands.delete(message.id);
    if(message.error)pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
    else pending.resolve(message.result??{});
  });
  await pageSession.send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:false});
  async function waitForWorker(){for(let i=0;i<100&&!workerSessionId;i++)await sleep(50);if(!workerSessionId)throw new Error('Optimizer worker child target was not attached within 5 seconds.');}
  async function workerSend(method,params={}){
    await waitForWorker();const id=++commandSequence,sessionId=workerSessionId;
    const response=new Promise((resolve,reject)=>pendingCommands.set(id,{resolve,reject}));
    await pageSession.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})});
    return response;
  }
  async function sampleWorkerHeap(){
    if(!workerSessionId)return null;
    if(profilerGeneration!==workerGeneration){await workerSend('Runtime.enable');await workerSend('HeapProfiler.enable');profilerGeneration=workerGeneration;}
    await workerSend('HeapProfiler.collectGarbage');
    return workerSend('Runtime.getHeapUsage');
  }

  await page.evaluate(async()=>{
    const [{OptimizerWorkerClient},{defaultBoard},{ACTION_BY_ID,cloneAction},{BOARD_LAYOUTS}]=await Promise.all([
      import('/js/ui/optimizerClient.js'),import('/js/data/defaultState.js'),import('/js/data/actionCatalog.js'),import('/js/domain/rules.js')
    ]);
    const roles=['core','mid','support'];
    const traits=['Fractal','Benevolent','Vampiric','Unique','Friendly'];
    function expandedBoard(){
      const board=structuredClone(defaultBoard);board.layoutId='expanded_5';
      const extra={core:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Deaths',qualityTier:4,trait:'Unique'}],mid:[{stat:'GPM',qualityTier:2,trait:'Friendly'},{stat:'Stuns',qualityTier:4,trait:'Unique'}],support:[{stat:'Stuns',qualityTier:2,trait:'Friendly'},{stat:'Smokes Used',qualityTier:4,trait:'Unique'}]};
      for(const role of roles){const slots=BOARD_LAYOUTS.expanded_5.roles[role],first=board[role].emblems.map((e,i)=>({...e,id:`${role}-${i}`,position:i,color:slots[i].color}));board[role].emblems=[...first,...extra[role].map((e,j)=>({id:`${role}-${j+3}`,position:j+3,color:slots[j+3].color,...e}))];}
      return board;
    }
    function mutate(board,index){
      const out=structuredClone(board);
      for(const [r,role] of roles.entries())out[role].emblems=out[role].emblems.map((e,i)=>({...e,qualityTier:1+((e.qualityTier-1+index+i+r)%5),trait:traits[(traits.indexOf(e.trait)+index+2*i+r)%traits.length]}));
      return out;
    }
    const menuIds=[
      ['green-stat-all','red-quality-all','blue-trait-all'],
      ['quality-increase-one','red-quality-all','green-quality-all'],
      ['red-stat-all','green-stat-all','blue-stat-all'],
      ['blue-stat-all','quality-increase-one','green-trait-all']
    ];
    const client=new OptimizerWorkerClient();
    globalThis.__v1MemorySoak={
      async run(index){
        const phase=index%6;
        const expanded=phase===1||phase===3||phase===5;
        const target=phase===2||phase===3||phase===5;
        const tokens=phase===2||phase===3?1:2;
        const board=mutate(expanded?expandedBoard():structuredClone(defaultBoard),index);
        const ids=menuIds[index%menuIds.length];
        const state={board,tokensRemaining:tokens,menu:ids.map(id=>cloneAction(ACTION_BY_ID.get(id))),menuRerollAvailable:true,username:`v1 memory soak ${index}`,objective:target?'target_probability':'expected_score',...(target?{targetScore:expanded?79500:65000}:{})};
        const started=performance.now();
        const result=await client.optimize(state);
        return {wallMs:performance.now()-started,optimizerWallMs:result.optimizerWallMs,layout:expanded?'expanded_5':'legacy_3',objective:state.objective,tokens,searchMode:result.diagnostics.searchMode,adaptiveFallbacks:result.diagnostics.adaptiveRefinement?.fallbacks??0,pageHeapBytes:performance.memory?.usedJSHeapSize??null};
      },
      dispose(){client.dispose();}
    };
  });

  const samples=[];
  for(let i=0;i<requestCount;i++){
    const generationBefore=workerGeneration;
    const run=await page.evaluate(index=>globalThis.__v1MemorySoak.run(index),i);
    // Worker retirement occurs synchronously when the result is accepted. Allow the target
    // detach event to reach CDP before deciding whether this request intentionally retired it.
    await sleep(25);
    const retiredAfterRequest=!workerSessionId;
    const heap=retiredAfterRequest?null:await sampleWorkerHeap();
    samples.push({request:i+1,...run,workerGeneration:retiredAfterRequest?generationBefore||workerGeneration:workerGeneration,workerRetiredAfterRequest:retiredAfterRequest,workerUsedHeapBytes:heap?.usedSize??null,workerTotalHeapBytes:heap?.totalSize??null});
    console.log(`${i+1}/${requestCount} gen=${workerGeneration} ${run.layout} ${run.objective} t=${run.tokens} worker=${heap?`${(heap.usedSize/1048576).toFixed(1)} MiB`:'retired'} wall=${run.wallMs.toFixed(0)} ms`);
  }
  await page.evaluate(()=>globalThis.__v1MemorySoak.dispose());
  await pageSession.detach();
  await browser.close();

  const measured=samples.map(x=>x.workerUsedHeapBytes).filter(Number.isFinite);
  const generations=[...new Set(samples.map(x=>x.workerGeneration).filter(x=>x>0))];
  const perGeneration=generations.map(g=>{
    const rows=samples.filter(x=>x.workerGeneration===g),heaps=rows.map(x=>x.workerUsedHeapBytes).filter(Number.isFinite);
    return {generation:g,requests:rows.map(x=>x.request),retiredAfterRequest:rows.some(x=>x.workerRetiredAfterRequest),maxMeasuredUsedHeapBytes:heaps.length?Math.max(...heaps):null,lastMeasuredUsedHeapBytes:heaps.at(-1)??null};
  });
  const artifact={
    capturedAt:new Date().toISOString(),
    runtime:{node:process.version,chrome},
    protocol:{requests:requestCount,forcedGcBeforeWorkerSample:true,workerMeasurement:'Chrome DevTools Protocol Runtime.getHeapUsage on each dedicated optimizer-worker generation',workload:'mixed legacy/expanded, expected/target, t=1/2 requests with deterministic quality/trait edits'},
    workerTargetUrl,
    summary:{
      workerGenerations:generations.length,
      retiredRequests:samples.filter(x=>x.workerRetiredAfterRequest).map(x=>x.request),
      maxMeasuredWorkerUsedHeapBytes:measured.length?Math.max(...measured):null,
      medianMeasuredWorkerUsedHeapBytes:median(measured),
      finalRequestRetiredWorker:samples.at(-1)?.workerRetiredAfterRequest??null
    },
    perGeneration,
    measurementNotes:[
      'Worker retained heap is sampled directly from the dedicated optimizer worker, not from performance.memory on the page.',
      'HeapProfiler.collectGarbage runs immediately before each retained-heap sample to reduce ordinary GC timing noise.',
      'A request that intentionally retires its worker has no post-request heap sample because the isolate has already been destroyed; the following request creates a new worker generation.',
      'The sequence intentionally changes banner qualities/traits and mixes supported routes so persistent caches see more than one repeated state.',
      'This is a finite soak characterization of the bounded worker-lifetime policy, not a proof about every possible request sequence.'
    ],
    samples
  };
  fs.writeFileSync('benchmarks/v1-worker-memory-soak.json',JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify({summary:artifact.summary,perGeneration},null,2));
}finally{server.kill('SIGTERM');}
