import fs from 'node:fs';

function appendMarker(path,marker,content){const text=fs.readFileSync(path,'utf8');if(text.includes(marker))return;fs.writeFileSync(path,text.replace(/\s*$/,'')+'\n\n'+content.trim()+'\n');}
function replaceOnce(path,from,to){const text=fs.readFileSync(path,'utf8');if(!text.includes(from))throw new Error(`Missing docs anchor in ${path}`);fs.writeFileSync(path,text.replace(from,to));}
const perf=JSON.parse(fs.readFileSync('benchmarks/m6f-browser-performance.json','utf8'));
const rows=perf.cases.map(c=>{
  const heap=n=>Number.isFinite(n)?`${(n/1048576).toFixed(2)} MB`:'n/a';
  return `| ${c.caseId} | ${c.cold.wallMs.toFixed(0)} ms | ${c.cold.optimizerWallMs.toFixed(0)} ms | ${c.warm.wallMs.toFixed(0)} ms | ${c.warm.optimizerWallMs.toFixed(0)} ms | ${c.cold.mainThreadLongTaskMs.toFixed(1)} ms | ${c.warm.transferRoundTripMs.toFixed(1)} ms | ${heap(c.cold.heapPeak)} | ${heap(c.warm.heapAfter)} | ${heap(c.repeatedRunHeapGrowthBytes)} | ${c.cold.payloadBytes} B | ${c.cold.searchMode} |`;
}).join('\n');
appendMarker('PERFORMANCE.md','## M6F browser worker characterization',`
## M6F browser worker characterization

M6F moves recommendation/search work from the browser main thread into a reusable module Web Worker. These measurements were produced from the generated \`docs/\` deployment using headless Chrome on the same GitHub runner; they characterize the production worker boundary rather than Node-only engine calls. Raw observations are in \`benchmarks/m6f-browser-performance.json\`.

| Case | Cold wall | Cold optimizer | Warm wall | Warm optimizer | Main-thread long tasks | Warm request round-trip | Page heap peak* | Warm retained heap* | 3-repeat heap growth* | Request payload | Route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
${rows}

\* Chrome \`performance.memory\` reports the page isolate and does not reliably include the worker isolate, so heap values are browser-side indicators rather than total process memory. A negative repeated-run growth value means the browser reclaimed more page memory than it retained over that interval; it is not evidence of negative worker memory use.

The important product result is structural: optimizer computation no longer executes on the UI thread. All five measured cases recorded 0 ms of Long Tasks API time during optimization. The first call includes worker startup and one-time immutable model loading; subsequent calls reuse the same worker/model bundle. The cold-versus-warm wall-time difference therefore characterizes startup/model-load plus cache warm-up rather than a change in search semantics. Each request sends only canonical \`OptimizerState\`, avoiding repeated transfer of the statistical model.

The routing evidence is also unchanged from M6E: legacy cases report \`exact\`, normal expanded t=2 cases report \`expanded_t2_adaptive\` with policy \`adaptive-tight\`, and the required fallback case reports \`expanded_t2_adaptive_exact_fallback\`. No search-policy thresholds or adaptive stages were changed in response to browser measurements.
`);
replaceOnce('README.md','1. Match your current Core, Mid, and Support War Banners.','1. Choose **3 Emblems** or **5 Emblems** in Current Board, then match your Core, Mid, and Support War Banners.');
appendMarker('README.md','## Board layouts',`
## Board layouts

The Current Board selector supports both TI 2026 banner geometries. **3 Emblems** is the backward-compatible default; **5 Emblems** uses the expanded five-slot board. Switching layouts preserves the first three emblem states, selected teams, expected series, roll tokens, and the current three offered actions. New fourth/fifth slots use deterministic legal defaults, and **Reset Board** resets within the layout you currently selected.

Recommendation search runs in a Web Worker so the page remains responsive during heavier five-emblem calculations. Editing the board or switching layouts cancels any pending recommendation and prevents stale results from being displayed.
`);
appendMarker('ENGINEERING_ROADMAP.md','## M6F outcome — board-layout UI and worker boundary',`
## M6F outcome — board-layout UI and worker boundary

M6F completes the production boundary opened by M6A–M6E. The browser UI now exposes both supported canonical board layouts through one 3/5-emblem selector while retaining the three-emblem default. Layout construction and conversion are driven by \`BOARD_LAYOUTS\`; the UI does not duplicate slot-color geometry. Internally, 3 Emblems maps to \`legacy_3\` and 5 Emblems maps to \`expanded_5\`, but those identifiers remain implementation detail rather than normal product copy.

The optimizer is now invoked through \`OptimizerWorkerClient → optimizer.worker → existing engine APIs\`. Synchronous engine entry points remain intact for Node tests, benchmarks, and engineering tools. Active stale searches are cancelled by terminating the worker; request ids provide a second deterministic stale-response guard. Idle workers are reused so model loading and startup are amortized.

End-to-end regression coverage proves exact worker/synchronous recommendation parity, canonical 3↔5 conversion semantics, no token/menu mutation on layout changes, legacy routing preservation, and expanded t=2 routing through the frozen M6E \`adaptive-tight\` policy with existing exact fallback semantics. M6F makes **no changes** to M6D/M6E search configuration or t=2 semantics.

Browser measurements are recorded in \`benchmarks/m6f-browser-performance.json\` and summarized in \`PERFORMANCE.md\`. With this product/runtime integration complete, M6F stops; longer-horizon search remains a separate future milestone.
`);
let m6f=fs.readFileSync('M6F_UI_LAYOUT_AND_WORKER_INTEGRATION.md','utf8');
m6f=m6f.replace('**Status:** implementation in validation','**Status:** complete');
if(!m6f.includes('## Measured browser result'))m6f=m6f.replace('## Exit rule',`## Measured browser result\n\nThe generated deployment was characterized in headless Chrome using the real module worker. All five required workloads recorded 0 ms of main-thread Long Tasks API time during optimizer execution. Legacy cases remained on the exact route, expanded t=2 cases remained on M6E \`adaptive-tight\`, and the fallback workload reported \`expanded_t2_adaptive_exact_fallback\`. See \`benchmarks/m6f-browser-performance.json\` for raw cold/warm/repeated observations and \`PERFORMANCE.md\` for the compact table. No M6E policy parameter was retuned.\n\n## Exit rule`);
fs.writeFileSync('M6F_UI_LAYOUT_AND_WORKER_INTEGRATION.md',m6f);
console.log('Finalized M6F documentation from browser benchmark artifact.');
