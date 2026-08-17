import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const refinement=read('../src/import/emblemOcrRefinement.ts');
const boardView=read('../src/ui/boardView.ts');

test('low-confidence stat uses Otsu native-resolution retry before conditional raw fallback',()=>{
  assert.doesNotMatch(refinement,/statStrip=\{left:base\.left,top:base\.top,width:base\.width,height:base\.height\*\.38\}/);
  assert.doesNotMatch(refinement,/canvas\(src,statStrip\)/);
  assert.match(refinement,/runStatRepresentationFallbacks\(/);
  assert.match(refinement,/rawStatCanvas=canvas\(src,statNameStrip\),processed=otsuCanvas\(rawStatCanvas\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:raw/);
  assert.match(refinement,/acceptsStatEvidence\(sm\.score,sc\)/);
  assert.ok(refinement.indexOf('stat:${role}:${i+1}:otsu')<refinement.indexOf('stat:${role}:${i+1}:raw'));
});

test('dedicated tier OCR runs only while the tier itself remains below review confidence',()=>{
  assert.match(refinement,/!tier\.direct&&shouldRetryTier\(confidenceFor\(raw,qp\)\)/);
});

test('successful stat retries synchronize final diagnostic stat values',()=>{
  assert.match(refinement,/d\.normalizedStat=sm\.value;d\.statMatchScore=sm\.score/);
});

test('Madstone keeps its engine key while displaying the client label',()=>{
  assert.match(boardView,/stat === 'Madstone' \? 'Madstone Collected' : stat/);
  assert.match(boardView,/value="\$\{escapeHtml\(stat\)\}"/);
  assert.match(boardView,/escapeHtml\(statDisplayName\(stat\)\)/);
});
