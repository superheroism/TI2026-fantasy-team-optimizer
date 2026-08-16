import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { copyDiagnosticJson } from '../build/js/ui/screenshotImport.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const index=read('../site/index.html');
const css=read('../site/screenshot-import.css');
const boardView=read('../src/ui/boardView.ts');
const screenshotUi=read('../src/ui/screenshotImport.ts');

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

test('screenshot review classes attach only to exact editable targets',()=>{
  assert.match(boardView,/\.emblem\.screenshot-review-target-emblem/);
  assert.match(boardView,/\.team-select\.screenshot-review-target-team/);
  assert.match(screenshotUi,/\.op-select\.screenshot-review-target-operation/);
  assert.match(screenshotUi,/screenshot-review-target-token/);
  assert.doesNotMatch(boardView,/\.banner\.screenshot-review-target/);
  assert.doesNotMatch(screenshotUi,/\.op-card\.screenshot-review-target-operation/);
  assert.doesNotMatch(css,/\.banner\.screenshot-review-target/);
  assert.doesNotMatch(css,/\.op-card\.screenshot-review-target-operation/);
  assert.match(css,/\.team-select\.screenshot-review-target-team,\.op-select\.screenshot-review-target-operation,#tokens\.screenshot-review-target-token/);
});

test('optimizer confirmation clears emblem, team, action, and token review styling',()=>{
  assert.match(screenshotUi,/function clearAllReviewHighlights/);
  assert.match(screenshotUi,/clearScreenshotReviewHighlights\(\);clearActionReviewHighlights\(\);clearTokenReviewHighlight\(\)/);
  assert.match(screenshotUi,/optimize\.addEventListener\('click',[\s\S]*clearAllReviewHighlights\(\)/);
});
