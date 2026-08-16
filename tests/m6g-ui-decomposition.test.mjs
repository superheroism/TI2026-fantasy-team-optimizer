import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApplicationState } from '../docs/js/ui/state.js';
import { ACTION_CATALOG } from '../docs/js/data/actionCatalog.js';
import { resolvedLayoutId } from '../docs/js/data/defaultState.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('application mutations emit centralized invalidation',()=>{
  const state=new ApplicationState();
  const events=[];
  state.setInvalidator(event=>events.push(event));
  state.mutateBoard(board=>{board.core.expectedSeries=2;},false);
  state.replaceMenuOperation(0,structuredClone(ACTION_CATALOG[3]),true);
  state.updateControls({tokensRemaining:7,username:'tester',targetScore:40000,objective:'target_probability'},true);
  state.changeLayout('expanded_5');
  state.advanceRoll();
  state.resetBoard();
  assert.equal(events.length,6);
  assert.deepEqual(events.map(event=>event.preserveComparison),[false,true,true,false,true,false]);
});

test('presentation-only state does not invalidate optimizer results',()=>{
  const state=new ApplicationState();
  let invalidations=0;
  state.setInvalidator(()=>invalidations++);
  state.setComparisonRole('support');
  state.setTheme('light');
  assert.equal(invalidations,0);
});

test('layout conversion preserves tokens and menu while reset preserves layout',()=>{
  const state=new ApplicationState();
  state.updateControls({tokensRemaining:6});
  state.replaceMenuOperation(0,structuredClone(ACTION_CATALOG[3]));
  const menuIds=state.menu.map(operation=>operation.id);
  assert.equal(state.changeLayout('expanded_5'),true);
  assert.equal(resolvedLayoutId(state.board),'expanded_5');
  assert.equal(state.tokensRemaining,6);
  assert.deepEqual(state.menu.map(operation=>operation.id),menuIds);
  state.resetBoard();
  assert.equal(resolvedLayoutId(state.board),'expanded_5');
  assert.equal(state.tokensRemaining,10);
});

test('advance roll changes token budget only and stops at zero',()=>{
  const state=new ApplicationState();
  state.updateControls({tokensRemaining:1});
  const board=structuredClone(state.board);
  const menu=structuredClone(state.menu);
  assert.equal(state.advanceRoll(),true);
  assert.equal(state.tokensRemaining,0);
  assert.deepEqual(state.board,board);
  assert.deepEqual(state.menu,menu);
  assert.equal(state.advanceRoll(),false);
});

test('optimizerState is the canonical UI-to-worker snapshot',()=>{
  const state=new ApplicationState();
  const initial=state.optimizerState();
  assert.equal(initial.board,state.board);
  assert.equal(initial.menu,state.menu);
  assert.equal(initial.tokensRemaining,10);
  assert.equal(initial.menuRerollAvailable,true);
  assert.equal('targetScore' in initial,false);
  state.updateControls({targetScore:42000,objective:'target_probability'});
  const changed=state.optimizerState();
  assert.equal(changed.targetScore,42000);
  assert.equal(changed.objective,'target_probability');
});

test('presentation modules do not acquire search or transition policy',()=>{
  for(const module of ['state','controls','boardView','actionView','plots']){
    const source=read(`../src/ui/${module}.ts`);
    assert.doesNotMatch(source,/recommendNextAction|targetSearch|generateTransitions|ADAPTIVE_TIGHT|expandedT2Strategy|BOARD_LAYOUTS/);
  }
  const app=read('../src/ui/app.ts');
  assert.doesNotMatch(app,/recommendNextAction\(/);
  assert.match(app,/OptimizerWorkerClient/);
});

test('app.ts is composition-oriented',()=>{
  const app=read('../src/ui/app.ts');
  assert.ok(Buffer.byteLength(app,'utf8')<22000);
  assert.doesNotMatch(app,/function emblemCard|function bannerColumn|function drawHistogram|function renderOperationEditors/);
  assert.match(app,/renderBoardHtml/);
  assert.match(app,/renderActionResults/);
  assert.match(app,/bindDynamicControls/);
  assert.match(app,/drawHistogram/);
});

test('central invalidation owns worker cancellation and stale clearing',()=>{
  const app=read('../src/ui/app.ts');
  const start=app.indexOf('function invalidateOptimizerPresentation');
  const end=app.indexOf('appState.setInvalidator');
  assert.ok(start>=0&&end>start);
  const invalidation=app.slice(start,end);
  assert.match(invalidation,/optimizerClient\.invalidate\(\)/);
  assert.match(invalidation,/clearResultState\(\)/);
  assert.match(invalidation,/Setup changed/);
});
