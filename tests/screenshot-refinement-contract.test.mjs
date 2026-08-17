import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const refinement=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
const calibration=readFileSync(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');

test('low-confidence stat alone triggers native emblem refinement',()=>{
  assert.match(refinement,/if\(!shouldRetryStat\(confidenceFor\(raw,sp\)\)&&confidenceFor\(raw,qp\)>=\.9&&confidenceFor\(raw,tp\)>=\.9\)continue/);
  assert.doesNotMatch(refinement,/if\(confidenceFor\(raw,qp\)>=\.9&&confidenceFor\(raw,tp\)>=\.9\)continue/);
});

test('strong native stat retry can supersede weak initial evidence',()=>{
  assert.match(calibration,/statRaw>=\.9&&\(statChanged\|\|statStrengthened\)/);
  assert.doesNotMatch(calibration,/statRaw>=\.95&&\(statChanged\|\|statStrengthened\)/);
  assert.match(calibration,/statComponents\.fieldConsistency=statChanged\?\.9:1/);
});
