import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/ui/app.ts',import.meta.url),'utf8');
const loader=readFileSync(new URL('../src/data/statisticalModel.ts',import.meta.url),'utf8');

test('public page omits modeling-boundary and affiliation footer copy',()=>{
  assert.equal(index.includes('V1 modeling boundary'),false);
  assert.equal(index.includes('Independent fan-made tool'),false);
  assert.equal(index.includes('Not affiliated with Valve'),false);
});

test('emblem UI derives multiplier and active bonus rather than accepting them as inputs',()=>{
  assert.equal(app.includes('data-field="multiplier"'),false);
  assert.equal(app.includes('data-field="activeBonus"'),false);
  assert.match(app,/derived\.effectiveMultiplierPct/);
  assert.match(app,/derived\.traitModifierPct/);
  assert.match(app,/data-field="qualityTier"/);
  assert.match(app,/data-field="trait"/);
});

test('production data loader uses the committed local model and no synthetic UI fallback',()=>{
  assert.match(loader,/\.\/data\/ti2026-statistical-model\.json/);
  assert.equal(loader.includes('cdn.jsdelivr.net'),false);
  assert.equal(loader.includes('raw.githubusercontent.com'),false);
  assert.equal(app.includes('demoData'),false);
  assert.match(app,/No synthetic scoring data are being substituted/);
});

test('Run Optimizer recalculates the visible selected-board state before optimization',()=>{
  assert.match(app,/async function runOptimizer\(\)/);
  const optimizer=app.slice(app.indexOf('async function runOptimizer()'),app.indexOf('function clearHistogram'));
  const recalcAt=optimizer.indexOf('await runSelected(false)');
  const snapshotAt=optimizer.indexOf('const s=state()');
  const recommendAt=optimizer.indexOf('optimizerClient.optimize(s)');
  assert.ok(recalcAt>=0,'optimizer must await selected-board recalculation');
  assert.ok(snapshotAt>recalcAt,'optimizer state must be captured after recalculation');
  assert.ok(recommendAt>snapshotAt,'worker recommendation must run after the refreshed state is captured');
  assert.equal(app.includes('recommendNextAction(s,data,true)'),false,'browser UI must not run optimizer search synchronously');
  assert.match(app,/Run Optimizer to refresh the score distribution and evaluate the next move/);
});

test('statistical visualizations expose distribution markers and interval-based team comparisons',()=>{
  assert.match(app,/bins=40/);
  assert.match(app,/marker\(expected/);
  assert.match(app,/marker\(median/);
  assert.match(app,/marker\(p10/);
  assert.match(app,/marker\(p90/);
  assert.match(app,/team-interval-row/);
  assert.match(app,/interval-range/);
  assert.match(app,/Δ SELECTED/);
  assert.equal(app.includes('bar-track'),false);
});

test('decision UI centers the three offered actions and exposes terminal outcome ranges',()=>{
  assert.match(index,/id="action-console"/);
  assert.match(index,/id="ops"/);
  assert.match(index,/id="menu-ev"/);
  assert.match(index,/id="stop-ev"/);
  assert.match(index,/id="next-roll"/);
  assert.ok(index.indexOf('id="board"') < index.indexOf('id="action-console"'));
  assert.ok(index.indexOf('id="action-console"') < index.indexOf('id="hist"'));
  assert.match(app,/outcomeP10Utility/);
  assert.match(app,/outcomeMedianUtility/);
  assert.match(app,/outcomeP90Utility/);
  assert.match(app,/BEST TARGET/);
  assert.match(app,/MODELED REROLL \/ CONTINUATION OUTCOME Δ VS STOP/);
  assert.match(app,/data-action-target/);
  assert.match(app,/Δ VS STOP/);
  assert.match(app,/rank-head/);
});

test('emblem cards omit redundant tiny slot-tier footer',()=>{
  assert.equal(app.includes('slot-number'),false);
  assert.equal(app.includes('SLOT ${index+1}'),false);
});

test('banner editor separates selectable teams from attached player labels and keeps derived emblem values',()=>{
  assert.match(app,/displayTeamName\(p\.team\)/);
  assert.match(app,/attachedPlayerLabel\(b\.selectedTeam,role\)/);
  assert.match(app,/ATTACHED PLAYER/);
  assert.match(app,/client-kind">STAT/);
  assert.match(app,/client-kind">TIER/);
  assert.match(app,/client-kind">TRAIT/);
  assert.match(app,/derived\.effectiveMultiplierPct/);
  assert.match(app,/derived\.tierBonusPct/);
  assert.match(app,/derived\.traitModifierPct/);
});

test('visual system supports unique purple-gold night and cream themes without changing RGB emblem semantics',()=>{
  const css=readFileSync(new URL('../site/styles.css',import.meta.url),'utf8');
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
  assert.match(app,/rec\.action\.kind==='menu_reroll'/);
  assert.match(app,/rec\.action\.kind==='stop'/);
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
  assert.equal(app.includes('Reroll result is uniform'),false);
  assert.equal(app.includes('Showing best target'),false);
  assert.equal(app.includes('shared scale across actions'),false);
});

test('action range diagram uses fixed vertical lanes for P10/P90, median, expected, and places 0 beneath the axis',()=>{
  assert.match(app,/range-marker-label/);
  assert.equal(app.includes("label:'STOP'"),false);
  assert.match(app,/rangeLaneLabel\('p10'/);
  assert.match(app,/rangeLaneLabel\('median'/);
  assert.match(app,/rangeLaneLabel\('expected'/);
  assert.match(app,/rangeLaneLabel\('p90'/);
  assert.match(app,/range-bottom/);
  assert.match(app,/class="range-zero"/);
  assert.match(app,/range-top-lane/);
  assert.match(app,/range-middle-lane/);
  assert.match(app,/range-lower-lane/);
});

test('recommendation highlights the target banner and affected stat tier or trait rows',()=>{
  assert.match(app,/recommended-target/);
  assert.match(app,/recommended-target-element/);
  assert.match(app,/affectedIndices/);
  assert.match(app,/data-element="stat"/);
  assert.match(app,/data-element="quality"/);
  assert.match(app,/data-element="trait"/);
});

test('recommendation confidence has a hover explanation and best current setup replaces stop-lock copy',()=>{
  assert.match(index,/confidence-tooltip/);
  assert.match(app,/confidenceExplanation/);
  assert.match(index,/BEST CURRENT SETUP/);
  assert.match(index,/Score with best available team \+ title/);
  assert.equal(index.includes('best-free'),false);
});

test('next roll decrements tokens and returns the user to the top of the page',()=>{
  assert.match(app,/tokens=Math\.max\(0,tokens-1\)/);
  assert.match(app,/window\.scrollTo\(\{top:0,behavior:'smooth'\}\)/);
});

test('layout selector is the only product geometry control and exposes both supported layouts',()=>{
  assert.match(index,/BANNER LAYOUT/);
  assert.ok(index.includes('>3 Emblems</button>'));
  assert.ok(index.includes('>5 Emblems</button>'));
  assert.doesNotMatch(index,/legacy_3|expanded_5/);
  assert.ok(app.includes('convertBoardLayout(board,target)'));
  assert.ok(app.includes('createDefaultBoard(layoutId)'));
  assert.ok(app.includes('optimizerClient.invalidate()'));
  assert.ok(app.includes('optimizerClient.optimize(s)'));
  assert.match(app,/data-layout-slots/);
});

test('expanded_5 exists in the engine but is unreachable is prevented by UI contract',()=>{
  const rules=readFileSync(new URL('../src/domain/rules.ts',import.meta.url),'utf8');
  assert.match(rules,/expanded_5/);
  assert.ok(index.includes('>5 Emblems</button>'));
});
