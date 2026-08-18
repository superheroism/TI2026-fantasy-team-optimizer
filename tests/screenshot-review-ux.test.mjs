import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyDiagnosticJson, ScreenshotReviewPathState } from '../build/js/ui/screenshotImport.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const index=read('../site/index.html');
const css=read('../site/screenshot-import.css');
const boardView=read('../src/ui/boardView.ts');
const screenshotUi=read('../src/ui/screenshotImport.ts');
const controls=read('../src/ui/controls.ts');
const app=read('../src/ui/app.ts');

test('OCR Diagnostic is an adjacent copy-only control with an out-of-flow toast',()=>{
  assert.match(index,/id="screenshot-import"[\s\S]*id="screenshot-ocr-diagnostic-copy"/);
  assert.match(index,/id="screenshot-ocr-diagnostic-copy"[^>]*hidden[^>]*disabled/);
  assert.match(index,/id="screenshot-ocr-diagnostic-toast"[^>]*hidden/);
  assert.match(css,/\.screenshot-diagnostic-toast\{position:absolute/);
  assert.equal(screenshotUi.includes('document.createElement'),false);
  assert.equal(screenshotUi.includes("<details"),false);
  assert.equal(screenshotUi.includes("<pre"),false);
  assert.equal(screenshotUi.includes('scrollTo('),false);
});

test('diagnostic copy helper writes exact JSON without DOM or scroll side effects',async()=>{
  const writes=[];
  const before={width:1440,height:900,scrollY:337};
  const copied=await copyDiagnosticJson('{"diagnostic":true}',async value=>{writes.push(value);});
  const after={width:1440,height:900,scrollY:337};
  assert.equal(copied,true);
  assert.deepEqual(writes,['{"diagnostic":true}']);
  assert.deepEqual(after,before);
  assert.equal(await copyDiagnosticJson('x',async()=>{throw new Error('denied');}),false);
});

test('review paths persist independently of DOM classes and resolve only the exact edited field',()=>{
  const review=new ScreenshotReviewPathState();
  review.replace([
    'banners.core.emblems[0].stat',
    'banners.core.emblems.0.qualityTier',
    'banners.mid.selectedTeam',
    'operationIds[1]',
    'tokensRemaining',
  ]);
  assert.equal(review.active,true);
  assert.deepEqual(review.paths,[
    'banners.core.emblems.0.stat',
    'banners.core.emblems.0.qualityTier',
    'banners.mid.selectedTeam',
    'operationIds.1',
    'tokensRemaining',
  ]);
  assert.equal(review.resolve('banners.core.emblems.0.stat'),true);
  assert.equal(review.paths.includes('banners.core.emblems.0.stat'),false);
  assert.equal(review.paths.includes('banners.core.emblems.0.qualityTier'),true);
  assert.equal(review.resolve('banners.support.emblems.0.stat'),false);
  assert.equal(review.count,4);
  review.clear();
  assert.equal(review.active,false);
  assert.equal(review.count,0);
});

test('screenshot review classes attach only to exact editable targets',()=>{
  assert.match(boardView,/\.emblem\.screenshot-review-target-emblem/);
  assert.match(boardView,/\.client-select\.screenshot-review-target-field/);
  assert.match(boardView,/\.team-select\.screenshot-review-target-team/);
  assert.match(boardView,/\.client-select\[data-field="\$\{field\}"\]/);
  assert.match(boardView,/\.\(stat\|qualityTier\|trait\)\$/);
  assert.match(screenshotUi,/\.op-select\.screenshot-review-target-operation/);
  assert.match(screenshotUi,/screenshot-review-target-token/);
  assert.doesNotMatch(boardView,/\.banner\.screenshot-review-target/);
  assert.doesNotMatch(screenshotUi,/\.op-card\.screenshot-review-target-operation/);
  assert.doesNotMatch(css,/\.banner\.screenshot-review-target/);
  assert.doesNotMatch(css,/\.op-card\.screenshot-review-target-operation/);
  assert.match(css,/\.client-select\.screenshot-review-target-field,\.team-select\.screenshot-review-target-team,\.op-select\.screenshot-review-target-operation,#tokens\.screenshot-review-target-token/);
});

test('field edits resolve canonical review paths for emblems teams actions and tokens',()=>{
  assert.match(controls,/reviewFieldEdited\(`banners\.\$\{role\}\.emblems\.\$\{index\}\.\$\{field\}`\)/);
  assert.match(controls,/reviewFieldEdited\(`banners\.\$\{role\}\.selectedTeam`\)/);
  assert.match(controls,/reviewFieldEdited\(`operationIds\.\$\{index\}`\)/);
  assert.match(controls,/reviewFieldEdited\('tokensRemaining'\)/);
  assert.match(app,/reviewFieldEdited: resolveScreenshotReviewPath/);
});

test('remaining review highlights are reapplied after board and menu rerender',()=>{
  assert.match(screenshotUi,/export function renderActiveScreenshotReviewHighlights/);
  assert.match(screenshotUi,/applyScreenshotReviewHighlights\(paths\)/);
  assert.match(screenshotUi,/applyActionReviewHighlights\(paths\)/);
  assert.match(screenshotUi,/applyTokenReviewHighlight\(paths\)/);
  assert.match(app,/bindDynamicControls[\s\S]*renderActiveScreenshotReviewHighlights\(\)/);
  assert.match(boardView,/flaggedEmblems/);
  assert.match(boardView,/screenshot-review-target-emblem/);
});

test('optimizer confirmation clears all unresolved review state and styling',()=>{
  assert.match(boardView,/clearScreenshotReviewHighlights[\s\S]*screenshot-review-target-field/);
  assert.match(screenshotUi,/function clearAllReviewHighlights/);
  assert.match(screenshotUi,/activeScreenshotReviewState\.clear\(\);\n    clearAllReviewHighlights\(\)/);
  assert.match(screenshotUi,/optimize\.addEventListener\('click',[\s\S]*Imported screenshot confirmed by optimization/);
});

test('reset and actual layout replacement clear stale screenshot review state',()=>{
  assert.match(app,/function resetBoard\(\)[\s\S]*discardScreenshotReviewState\('Board reset\. Screenshot review cleared\.'\)/);
  assert.match(app,/layoutChanged: \(\) => \{[\s\S]*discardScreenshotReviewState\('Layout changed\. Screenshot review cleared\.'\)/);
  assert.match(controls,/if \(state\.changeLayout\(target\)\) callbacks\.layoutChanged\(\)/);
});
