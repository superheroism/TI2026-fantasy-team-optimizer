import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const refinement=read('../src/import/emblemOcrRefinement.ts');
const boardView=read('../src/ui/boardView.ts');

test('low-confidence stat uses one preprocessed native-resolution fallback after the emblem retry',()=>{
  assert.doesNotMatch(refinement,/statStrip=\{left:base\.left,top:base\.top,width:base\.width,height:base\.height\*\.38\}/);
  assert.doesNotMatch(refinement,/canvas\(src,statStrip\)/);
  assert.match(refinement,/processed=otsuCanvas\(canvas\(src,statNameStrip\)\)/);
  assert.match(refinement,/statRec=await w\.recognize\(processed,\{tessedit_pageseg_mode:'7'\}/);
  assert.match(refinement,/sm\.score>=\.92&&sc>=\.9/);
});

test('successful stat retries synchronize final diagnostic stat values',()=>{
  assert.match(refinement,/d\.normalizedStat=sm\.value;d\.statMatchScore=sm\.score/);
});

test('Madstone keeps its engine key while displaying the client label',()=>{
  assert.match(boardView,/stat === 'Madstone' \? 'Madstone Collected' : stat/);
  assert.match(boardView,/value="\$\{escapeHtml\(stat\)\}"/);
  assert.match(boardView,/escapeHtml\(statDisplayName\(stat\)\)/);
});
