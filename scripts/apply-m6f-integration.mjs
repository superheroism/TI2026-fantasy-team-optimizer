import fs from 'node:fs';

function replaceOnce(path,from,to){
  const text=fs.readFileSync(path,'utf8');
  if(!text.includes(from))throw new Error(`M6F patch anchor missing in ${path}: ${from.slice(0,120)}`);
  const next=text.replace(from,to);
  if(next===text)throw new Error(`M6F patch made no change in ${path}`);
  fs.writeFileSync(path,next);
}
function appendOnce(path,marker,text){
  const current=fs.readFileSync(path,'utf8');
  if(current.includes(marker))return;
  fs.writeFileSync(path,current.replace(/\s*$/,'')+'\n\n'+text.trim()+'\n');
}

replaceOnce('src/ui/app.ts',
"import type { ActionEvaluation, BannerState, BoardState, DataBundle, MenuState, OfferedOperation, OptimizerState, RecommendationResult, Role, StatName, TraitName } from '../domain/types.js';",
"import type { ActionEvaluation, BannerState, BoardLayoutId, BoardState, DataBundle, MenuState, OfferedOperation, OptimizerState, RecommendationResult, Role, StatName, TraitName } from '../domain/types.js';");
replaceOnce('src/ui/app.ts',
"import { defaultBoard, defaultMenu } from '../data/defaultState.js';",
"import { convertBoardLayout, createDefaultBoard, defaultBoard, defaultMenu, resolvedLayoutId } from '../data/defaultState.js';");
replaceOnce('src/ui/app.ts',
"import { formatAction, recommendNextAction } from '../engine/optimizer.js';",
"import { formatAction } from '../engine/optimizer.js';\nimport { OptimizerRequestCancelledError, OptimizerWorkerClient } from './optimizerClient.js';");
replaceOnce('src/ui/app.ts',
"const actionTargetSelection=new Map<number,Role>();",
"const actionTargetSelection=new Map<number,Role>();\nconst optimizerClient=new OptimizerWorkerClient();");
replaceOnce('src/ui/app.ts',
"function markStale(preserveComparison=false){\n  $('#calc-status').textContent='Setup changed — Run Optimizer to refresh the selected setup';",
"function markStale(preserveComparison=false){\n  optimizerClient.invalidate();\n  $('#calc-status').textContent='Setup changed — Run Optimizer to refresh the selected setup';");
replaceOnce('src/ui/app.ts',
"    const result=recommendNextAction(s,data,true),rec=result.recommendation,elapsed=performance.now()-started;",
"    const workerRun=await optimizerClient.optimize(s),result=workerRun.result,rec=result.recommendation,elapsed=performance.now()-started;");
replaceOnce('src/ui/app.ts',
"  }catch(error){\n    $('#rec-action').textContent='Optimization error';\n    $('#rec-note').textContent=String(error);",
"  }catch(error){\n    if(error instanceof OptimizerRequestCancelledError)return;\n    $('#rec-action').textContent='Optimization error';\n    $('#rec-note').textContent=String(error);");
replaceOnce('src/ui/app.ts',
"function renderStructure(){\n  $('#board').innerHTML=roles.map(bannerColumn).join('');$('#ops').innerHTML=menu.map(opEditor).join('');renderComparisonTabs();bindDynamic();\n}",
"function updateLayoutToggle(){\n  const current=resolvedLayoutId(board);\n  document.querySelectorAll<HTMLButtonElement>('[data-layout-slots]').forEach(button=>{const active=(button.dataset.layoutSlots==='5'?'expanded_5':'legacy_3')===current;button.classList.toggle('active',active);button.setAttribute('aria-pressed',active?'true':'false');});\n}\nfunction changeLayout(target:BoardLayoutId){\n  syncStateFromDom();if(resolvedLayoutId(board)===target)return;\n  board=convertBoardLayout(board,target);renderStructure();markStale(false);\n}\nfunction renderStructure(){\n  $('#board').innerHTML=roles.map(bannerColumn).join('');$('#ops').innerHTML=menu.map(opEditor).join('');updateLayoutToggle();renderComparisonTabs();bindDynamic();\n}");
replaceOnce('src/ui/app.ts',
"  $('#optimize').addEventListener('click',()=>{if(data)runOptimizer();});$('#next-roll').addEventListener('click',()=>{if(data)advanceToNextRoll();});\n  $<HTMLInputElement>('#theme-toggle').addEventListener('change',event=>applyTheme((event.currentTarget as HTMLInputElement).checked?'dark':'light',true));",
"  $('#optimize').addEventListener('click',()=>{if(data)runOptimizer();});$('#next-roll').addEventListener('click',()=>{if(data)advanceToNextRoll();});\n  document.querySelectorAll<HTMLButtonElement>('[data-layout-slots]').forEach(button=>button.addEventListener('click',()=>changeLayout(button.dataset.layoutSlots==='5'?'expanded_5':'legacy_3')));\n  $<HTMLInputElement>('#theme-toggle').addEventListener('change',event=>applyTheme((event.currentTarget as HTMLInputElement).checked?'dark':'light',true));");
replaceOnce('src/ui/app.ts',
"  $('#reset').addEventListener('click',()=>{\n    board=structuredClone(defaultBoard);menu=structuredClone(defaultMenu);tokens=10;$<HTMLInputElement>('#tokens').value='10';\n    if(data){normalizeSelectedTeams();renderStructure();runSelected();}\n  });",
"  $('#reset').addEventListener('click',()=>{\n    optimizerClient.invalidate();const layoutId=resolvedLayoutId(board);board=createDefaultBoard(layoutId);menu=structuredClone(defaultMenu);tokens=10;$<HTMLInputElement>('#tokens').value='10';\n    if(data){normalizeSelectedTeams();renderStructure();markStale(false);void runSelected();}\n  });");

replaceOnce('site/index.html',
"      <div><div><p class=\"eyebrow\">CURRENT BOARD</p><h2>Replicate Your Three War Banners</h2></div></div>\n      <small>Team is selectable · attached players are fixed · Stat / Tier / Trait are editable · percentages are derived</small>",
"      <div class=\"board-section-title\"><div><p class=\"eyebrow\">CURRENT BOARD</p><h2>Replicate Your Three War Banners</h2></div><div class=\"layout-control\"><span>BANNER LAYOUT</span><div class=\"layout-segmented\" role=\"group\" aria-label=\"Banner layout\"><button type=\"button\" data-layout-slots=\"3\" class=\"active\" aria-pressed=\"true\">3 Emblems</button><button type=\"button\" data-layout-slots=\"5\" aria-pressed=\"false\">5 Emblems</button></div></div></div>\n      <small>Team is selectable · attached players are fixed · Stat / Tier / Trait are editable · percentages are derived</small>");

appendOnce('site/styles.css','/* M6F board layout selector */',`
/* M6F board layout selector */
.board-section-title{display:flex;align-items:flex-end!important;gap:18px!important;flex-wrap:wrap}
.layout-control{display:grid!important;gap:4px!important;min-width:210px}
.layout-control>span{font-size:9px;color:var(--muted);font-weight:850;letter-spacing:.09em}
.layout-segmented{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--line2);border-radius:5px;overflow:hidden;background:var(--bg-elev)}
.layout-segmented button{border:0;border-radius:0;padding:6px 10px;background:transparent;color:var(--muted);font-size:11px;white-space:nowrap}
.layout-segmented button+button{border-left:1px solid var(--line2)}
.layout-segmented button.active{background:var(--purple);color:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--purple2) 65%,transparent)}
@media(max-width:720px){.section-bar{align-items:flex-start;flex-direction:column}.section-bar>small{text-align:left}.board-section-title{align-items:flex-start!important}.layout-control{min-width:min(100%,260px)}}
`);

replaceOnce('tests/ui-contract.test.mjs',
"  const recommendAt=optimizer.indexOf('recommendNextAction(s,data,true)');",
"  const recommendAt=optimizer.indexOf('optimizerClient.optimize(s)');");
replaceOnce('tests/ui-contract.test.mjs',
"  assert.ok(recommendAt>snapshotAt,'recommendation must run after the refreshed state is captured');",
"  assert.ok(recommendAt>snapshotAt,'worker recommendation must run after the refreshed state is captured');\n  assert.equal(app.includes('recommendNextAction(s,data,true)'),false,'browser UI must not run optimizer search synchronously');");
appendOnce('tests/ui-contract.test.mjs',"expanded_5 exists in the engine but is unreachable",`
test('layout selector is the only product geometry control and exposes both supported layouts',()=>{
  assert.match(index,/BANNER LAYOUT/);
  assert.match(index,/>3 Emblems<\/button>/);
  assert.match(index,/>5 Emblems<\/button>/);
  assert.doesNotMatch(index,/legacy_3|expanded_5/);
  assert.match(app,/convertBoardLayout\(board,target\)/);
  assert.match(app,/createDefaultBoard\(layoutId\)/);
  assert.match(app,/optimizerClient\.invalidate\(\)/);
  assert.match(app,/optimizerClient\.optimize\(s\)/);
  assert.match(app,/data-layout-slots/);
});

test('expanded_5 exists in the engine but is unreachable is prevented by UI contract',()=>{
  const rules=readFileSync(new URL('../src/domain/rules.ts',import.meta.url),'utf8');
  assert.match(rules,/expanded_5/);
  assert.match(index,/>5 Emblems<\/button>/);
});
`);

console.log('Applied M6F UI/worker integration patch.');
