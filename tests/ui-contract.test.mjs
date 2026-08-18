import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACTION_CATALOG } from '../build/js/data/actionCatalog.js';
import { groupedActionOptions } from '../build/js/ui/actionView.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const index=read('../site/index.html');
const css=read('../site/styles.css');
const app=read('../src/ui/app.ts');
const state=read('../src/ui/state.ts');
const controls=read('../src/ui/controls.ts');
const boardView=read('../src/ui/boardView.ts');
const actionView=read('../src/ui/actionView.ts');
const plots=read('../src/ui/plots.ts');
const ui=[app,state,controls,boardView,actionView,plots].join('\n');
const loader=read('../src/data/statisticalModel.ts');

test('public page omits modeling-boundary and affiliation footer copy',()=>{
  assert.equal(index.includes('V1 modeling boundary'),false);
  assert.equal(index.includes('Independent fan-made tool'),false);
  assert.equal(index.includes('Not affiliated with Valve'),false);
});

test('emblem UI derives multiplier and active bonus rather than accepting them as inputs',()=>{
  assert.equal(ui.includes('data-field="multiplier"'),false);
  assert.equal(ui.includes('data-field="activeBonus"'),false);
  assert.match(boardView,/derived\.effectiveMultiplierPct/);
  assert.match(boardView,/derived\.traitModifierPct/);
  assert.match(boardView,/data-field="qualityTier"/);
  assert.match(boardView,/data-field="trait"/);
});

test('production data loader uses the committed local model and no synthetic UI fallback',()=>{
  assert.match(loader,/\.\/data\/ti2026-statistical-model\.json/);
  assert.equal(loader.includes('cdn.jsdelivr.net'),false);
  assert.equal(loader.includes('raw.githubusercontent.com'),false);
  assert.equal(ui.includes('demoData'),false);
  assert.match(app,/No synthetic scoring data are being substituted/);
});

test('Run Optimizer recalculates selected board before taking the worker snapshot',()=>{
  const start=app.indexOf('async function runOptimizer()');
  const end=app.indexOf('function advanceToNextRoll');
  assert.ok(start>=0&&end>start);
  const optimizer=app.slice(start,end);
  const recalcAt=optimizer.indexOf('await runSelected(false)');
  const snapshotAt=optimizer.indexOf('const state = appState.optimizerState()');
  const recommendAt=optimizer.indexOf('optimizerClient.optimize(state,appState.statisticalDatasetId)');
  assert.ok(recalcAt>=0,'optimizer must await selected-board recalculation');
  assert.ok(snapshotAt>recalcAt,'optimizer state must be captured after recalculation');
  assert.ok(recommendAt>snapshotAt,'worker recommendation must run after the refreshed state is captured');
  assert.equal(app.includes('recommendNextAction('),false,'browser UI must not run optimizer search synchronously');
  assert.match(app,/Run Optimizer to refresh the score distribution and evaluate the next move/);
});

test('statistical visualizations expose distribution markers and interval-based team comparisons',()=>{
  assert.match(plots,/const bins = 40/);
  assert.match(plots,/marker\(expected/);
  assert.match(plots,/marker\(median/);
  assert.match(plots,/marker\(p10/);
  assert.match(plots,/marker\(p90/);
  assert.match(plots,/team-interval-row/);
  assert.match(plots,/interval-range/);
  assert.match(plots,/Δ SELECTED/);
  assert.equal(ui.includes('bar-track'),false);
});

test('decision UI centers the three offered actions and exposes terminal outcome ranges',()=>{
  assert.match(index,/id="action-console"/);
  assert.match(index,/id="ops"/);
  assert.match(index,/id="menu-ev"/);
  assert.match(index,/id="stop-ev"/);
  assert.match(index,/id="next-roll"/);
  assert.ok(index.indexOf('id="board"') < index.indexOf('id="action-console"'));
  assert.ok(index.indexOf('id="action-console"') < index.indexOf('id="hist"'));
  assert.match(actionView,/outcomeP10Utility/);
  assert.match(actionView,/outcomeMedianUtility/);
  assert.match(actionView,/outcomeP90Utility/);
  assert.match(actionView,/BEST TARGET/);
  assert.match(actionView,/MODELED REROLL \/ CONTINUATION OUTCOME Δ VS STOP/);
  assert.match(actionView,/data-action-target/);
  assert.match(actionView,/Δ VS STOP/);
  assert.match(app,/rank-head/);
});

test('Available Action dropdowns group the complete catalog as Red Blue Green Boosts with family ordering',()=>{
  const html=groupedActionOptions('green-stat-all',new Set());
  const groups=[...html.matchAll(/<optgroup label="([^"]+)">([\s\S]*?)<\/optgroup>/g)].map(match=>({label:match[1],body:match[2]}));
  assert.deepEqual(groups.map(group=>group.label),['Red','Blue','Green','Boosts']);
  const ids=groups.flatMap(group=>[...group.body.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]));
  assert.equal(ids.length,ACTION_CATALOG.length);
  assert.equal(new Set(ids).size,ACTION_CATALOG.length);
  assert.deepEqual([...ids].sort(),ACTION_CATALOG.map(action=>action.id).sort());
  const familyOrder=['stat_reroll','quality_reroll','trait_reroll'];
  for(const color of ['red','blue','green']){
    const group=groups.find(candidate=>candidate.label?.toLowerCase()===color);
    assert.ok(group);
    const actual=[...group.body.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]);
    const expected=familyOrder.flatMap(kind=>ACTION_CATALOG.filter(action=>'color' in action&&action.color===color&&action.kind===kind).map(action=>action.id));
    assert.deepEqual(actual,expected);
  }
  const boosts=groups.find(group=>group.label==='Boosts');
  assert.ok(boosts);
  assert.deepEqual([...boosts.body.matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]),ACTION_CATALOG.filter(action=>!('color' in action)).map(action=>action.id));
  assert.equal(html.includes('Misc'),false);
});

test('emblem cards omit redundant tiny slot-tier footer',()=>{
  assert.equal(boardView.includes('slot-number'),false);
  assert.equal(boardView.includes('SLOT ${index+1}'),false);
});

test('banner editor separates selectable teams from attached player labels and keeps derived emblem values',()=>{
  assert.match(boardView,/displayTeamName\(player\.team\)/);
  assert.match(boardView,/attachedPlayerLabel\(banner\.selectedTeam, role\)/);
  assert.match(boardView,/ATTACHED PLAYER/);
  assert.match(boardView,/client-kind">STAT/);
  assert.match(boardView,/client-kind">TIER/);
  assert.match(boardView,/client-kind">TRAIT/);
  assert.match(boardView,/derived\.effectiveMultiplierPct/);
  assert.match(boardView,/derived\.tierBonusPct/);
  assert.match(boardView,/derived\.traitModifierPct/);
});

test('emblem fields share one derived-value column and all editable values use normal weight',()=>{
  assert.match(css,/input,select,option\{font-weight:400;letter-spacing:normal\}/);
  assert.match(css,/\.team-picker select,\.client-select,\.stat-select,\.op-select\{font-weight:400;letter-spacing:normal\}/);
  assert.match(css,/\.client-row\{grid-template-columns:42px minmax\(0,1fr\) 60px\}/);
  assert.match(css,/\.client-total,\.client-bonus\{min-width:0;text-align:right\}/);
  assert.match(css,/\.recommended-target-element \.client-select\{font-weight:400!important\}/);
});

test('visual system supports purple-gold night and cream themes without changing RGB emblem semantics',()=>{
  assert.match(index,/id="theme-toggle"[^>]*type="checkbox"[^>]*checked/);
  assert.match(index,/Dark Theme/);
  assert.match(css,/--purple:#7652a3/);
  assert.match(css,/--gold:#d7a83e/);
  assert.match(css,/body\[data-theme="light"\]/);
  assert.match(css,/--bg:#f3ede4/);
  assert.match(css,/\.emblem\.red\{background:var\(--red\)/);
  assert.match(css,/\.emblem\.green\{background:var\(--green\)/);
  assert.match(css,/\.emblem\.blue\{background:var\(--blue\)/);
});

test('menu reroll and stop can receive the same recommended treatment as offered actions',()=>{
  assert.match(index,/id="menu-option"/);
  assert.match(index,/id="stop-option"/);
  assert.match(app,/recommendation\.action\.kind === 'menu_reroll'/);
  assert.match(app,/recommendation\.action\.kind === 'stop'/);
});

test('detailed ranking includes continuation outcome quantiles for transparency',()=>{
  assert.match(app,/P10 Δ/);
  assert.match(app,/P50 Δ/);
  assert.match(app,/P90 Δ/);
  assert.match(app,/rank-quantile/);
});

test('primary workflow copy and controls match the streamlined reroll loop',()=>{
  assert.match(index,/CURRENT BOARD/);
  assert.match(index,/Replicate Your Three War Banners/);
  assert.match(index,/AVAILABLE ACTIONS/);
  assert.match(index,/Match the Three Offers Shown/);
  assert.match(index,/Optimize to find the best offers\. The best target for each offer will be shown by default; click to inspect\./);
  assert.match(index,/Run Optimizer/);
  assert.match(index,/Next Roll \(-1 Token\)/);
  assert.equal(index.includes('id="recalc"'),false);
  assert.equal(index.includes('Recalculate score'),false);
  assert.equal(index.includes('class="section-number">1'),false);
  assert.equal(index.includes('class="section-number">2'),false);
  assert.equal(ui.includes('Reroll result is uniform'),false);
  assert.equal(ui.includes('Showing best target'),false);
  assert.equal(ui.includes('shared scale across actions'),false);
});

test('action range diagram uses fixed vertical lanes and places 0 beneath the axis',()=>{
  assert.match(actionView,/range-marker-label/);
  assert.equal(actionView.includes("label:'STOP'"),false);
  assert.match(actionView,/rangeLaneLabel\('p10'/);
  assert.match(actionView,/rangeLaneLabel\('median'/);
  assert.match(actionView,/rangeLaneLabel\('expected'/);
  assert.match(actionView,/rangeLaneLabel\('p90'/);
  assert.match(actionView,/range-bottom/);
  assert.match(actionView,/class="range-zero"/);
  assert.match(actionView,/range-top-lane/);
  assert.match(actionView,/range-middle-lane/);
  assert.match(actionView,/range-lower-lane/);
});

test('recommendation highlights the target banner and affected stat tier or trait rows',()=>{
  assert.match(boardView,/recommended-target/);
  assert.match(boardView,/recommended-target-element/);
  assert.match(boardView,/affectedIndices/);
  assert.match(boardView,/data-element="stat"/);
  assert.match(boardView,/data-element="quality"/);
  assert.match(boardView,/data-element="trait"/);
});

test('recommendation omits the obsolete confidence explainer and keeps best current setup copy',()=>{
  assert.doesNotMatch(index,/rec-confidence|confidence-tooltip|confidence-help/);
  assert.doesNotMatch(actionView,/confidenceExplanation/);
  assert.doesNotMatch(app,/rec-confidence|confidence-tooltip|confidenceExplanation/);
  assert.match(index,/BEST CURRENT SETUP/);
  assert.match(index,/Score with best available team \+ title/);
  assert.equal(index.includes('best-free'),false);
});

test('next roll decrements tokens through application state and returns user to top',()=>{
  assert.match(state,/this\.tokensRemaining = Math\.max\(0, this\.tokensRemaining - 1\)/);
  assert.match(app,/window\.scrollTo\(\{ top: 0, behavior: 'smooth' \}\)/);
});

test('layout selector is the only product geometry control and exposes both supported layouts',()=>{
  assert.match(index,/BANNER LAYOUT/);
  assert.ok(index.includes('>3 Emblems</button>'));
  assert.ok(index.includes('>5 Emblems</button>'));
  assert.doesNotMatch(index,/legacy_3|expanded_5/);
  assert.match(state,/convertBoardLayout\(this\.board, target\)/);
  assert.match(state,/createDefaultBoard\(layoutId\)/);
  assert.match(app,/optimizerClient\.invalidate\(\)/);
  assert.match(app,/optimizerClient\.optimize\(state,appState\.statisticalDatasetId\)/);
  assert.match(controls,/data-layout-slots/);
});

test('expanded_5 exists in the engine and is reachable by the UI contract',()=>{
  const rules=read('../src/domain/rules.ts');
  assert.match(rules,/expanded_5/);
  assert.ok(index.includes('>5 Emblems</button>'));
});
