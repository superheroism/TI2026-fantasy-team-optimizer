import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const refinement=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
const retryPolicy=await readFile(new URL('../src/import/ocrRetryPolicy.ts',import.meta.url),'utf8');

test('P51 retains full-emblem and Otsu stat stages and restores raw stat OCR only as a final fallback',()=>{
  assert.match(refinement,/tessedit_pageseg_mode:'6'/);
  assert.match(refinement,/processed=otsuCanvas\(canvas\(src,statNameStrip\)\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:raw/);
  assert.ok(refinement.indexOf('stat:${role}:${i+1}:otsu')<refinement.indexOf('stat:${role}:${i+1}:raw'));
});

test('P51 keeps strict stat acceptance thresholds centralized and unchanged',()=>{
  assert.match(retryPolicy,/STAT_MATCH_GATE=\.92/);
  assert.match(retryPolicy,/STRUCTURED_CONFIDENCE_GATE=\.90/);
  assert.match(retryPolicy,/matchScore>=STAT_MATCH_GATE&&confidence>=STRUCTURED_CONFIDENCE_GATE/);
});

test('dedicated Tier retry remains conditioned on unresolved Tier confidence',()=>{
  assert.match(refinement,/!tier\.direct&&shouldRetryTier\(confidenceFor\(raw,qp\)\)/);
});
