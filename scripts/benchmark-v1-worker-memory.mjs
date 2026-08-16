import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const port=4173;
const requestCount=Number(process.env.SOAK_REQUESTS||24);
const warmupCount=Math.min(6,Math.max(2,Math.floor(requestCount/4)));
const server=spawn('python3',['-m','http.server',String(port),'--directory','docs'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const median=values=>{const xs=[...values].sort((a,b)=>a-b);const n=xs.length;return n?xs[Math.floor(n/2)]:null;};
const linearSlope=values=>{if(values.length<2)return null;const n=values.length,xbar=(n-1)/2,ybar=values.reduce((a,b)=>a+b,0)/n;let num=0,den=0;for(let i=0;i<n;i++){num+=(i-xbar)*(values[i]-ybar);den+=(i-xbar)**2;}return den?num/den:null;};

try{
  await sleep(700);
  const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-precise-memory-info']});
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`,{waitUntil:'networkidle0'});

  // Dedicated workers are child targets of the page and are not exposed as top-level
  // browser targets in all Chromium/Puppeteer combinations. Attach through the page's
  // Target domain and forward CDP commands to the worker session explicitly.
  const pageSession=await page.target().createCDPSession();
  let workerSessionId=null,workerTargetUrl=null,commandSequence=0;
  const pendingCommands=new Map();
  pageSession.on('Target.attachedToTarget',event=>{
    if(event.targetInfo.type==='worker'&&event.targetInfo.url.includes('optimizer.worker')){
      workerSessionId=event.sessionId;workerTargetUrl=event.targetInfo.url;
    }
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
    await waitForWorker();const id=++commandSequence;
    const response=new Promise((resolve,reject)=>pendingCommands.set(id,{resolve,reject}));
    await pageSession.send('Target.sendMessageToTarget',{sessionId:workerSessionId,message:JSON.stringify({id,method,params})});
    return response;
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

  let heapProfilerEnabled=false;
  const samples=[];
  for(let i=0;i<requestCount;i++){
    const run=await page.evaluate(index=>globalThis.__v1MemorySoak.run(index),i);
    if(!heapProfilerEnabled){await workerSend('Runtime.enable');await workerSend('HeapProfiler.enable');heapProfilerEnabled=true;}
    await workerSend('HeapProfiler.collectGarbage');
    const heap=await workerSend('Runtime.getHeapUsage');
    samples.push({request:i+1,...run,workerUsedHeapBytes:heap.usedSize,workerTotalHeapBytes:heap.totalSize});
    console.log(`${i+1}/${requestCount} ${run.layout} ${run.objective} t=${run.tokens} worker=${(heap.usedSize/1048576).toFixed(1)} MiB wall=${run.wallMs.toFixed(0)} ms`);
  }
  await page.evaluate(()=>globalThis.__v1MemorySoak.dispose());
  await pageSession.detach();
  await browser.close();

  const retained=samples.slice(warmupCount).map(x=>x.workerUsedHeapBytes);
  const windowSize=Math.min(6,Math.max(3,Math.floor(retained.length/3)));
  const firstWindow=retained.slice(0,windowSize),lastWindow=retained.slice(-windowSize);
  const artifact={
    capturedAt:new Date().toISOString(),
    runtime:{node:process.version,chrome},
    protocol:{requests:requestCount,warmupRequests:warmupCount,forcedGcBeforeWorkerSample:true,workerMeasurement:'Chrome DevTools Protocol Runtime.getHeapUsage on the dedicated optimizer worker',workload:'mixed legacy/expanded, expected/target, t=1/2 requests with deterministic quality/trait edits'},
    workerTargetUrl,
    summary:{
      firstPostWarmupMedianBytes:median(firstWindow),
      lastWindowMedianBytes:median(lastWindow),
      postWarmupSlopeBytesPerRequest:linearSlope(retained),
      minPostWarmupBytes:retained.length?Math.min(...retained):null,
      maxPostWarmupBytes:retained.length?Math.max(...retained):null,
      finalWorkerUsedHeapBytes:samples.at(-1)?.workerUsedHeapBytes??null
    },
    measurementNotes:[
      'Worker retained heap is sampled directly from the dedicated optimizer worker, not from performance.memory on the page.',
      'HeapProfiler.collectGarbage runs immediately before each retained-heap sample to reduce ordinary GC timing noise.',
      'The sequence intentionally changes banner qualities/traits and mixes supported routes so persistent caches see more than one repeated state.',
      'This is a finite soak characterization, not a proof that memory is bounded for every possible indefinitely long session.'
    ],
    samples
  };
  fs.writeFileSync('benchmarks/v1-worker-memory-soak.json',JSON.stringify(artifact,null,2)+'\n');
  console.log(JSON.stringify(artifact.summary,null,2));
}finally{server.kill('SIGTERM');}
