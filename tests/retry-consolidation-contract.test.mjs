import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const refinement=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');

test('retry consolidation retains full-emblem and Otsu stat stages but removes raw stat-row OCR',()=>{
  assert.match(refinement,/tessedit_pageseg_mode:'6'/);
  assert.match(refinement,/processed=otsuCanvas\(canvas\(src,statNameStrip\)\)/);
  assert.doesNotMatch(refinement,/statStrip=/);
});

test('retry consolidation keeps strict stat acceptance thresholds',()=>{
  assert.match(refinement,/sm\.score>=\.92&&sc>=\.9/);
});

test('dedicated tier retry is conditioned on unresolved tier confidence',()=>{
  assert.match(refinement,/!tier\.direct&&confidenceFor\(raw,qp\)<\.9/);
});
