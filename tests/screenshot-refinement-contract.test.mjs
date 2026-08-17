import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const refinement=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
const calibration=readFileSync(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');

test('low-confidence stat alone triggers dedicated stat refinement without duplicate full-emblem OCR',()=>{
  assert.match(refinement,/const retryStat=shouldRetryStat\(confidenceFor\(raw,sp\)\),retryTier=shouldRetryTier\(confidenceFor\(raw,qp\)\),retryTrait=confidenceFor\(raw,tp\)<\.9/);
  assert.match(refinement,/if\(retryTier\|\|retryTrait\).*emblem:/s);
  assert.match(refinement,/let strongSupplementalTier=false;if\(retryStat/);
});

test('strong native stat retry can supersede weak initial evidence',()=>{
  assert.match(calibration,/statRaw>=\.9&&\(statChanged\|\|statStrengthened\)/);
  assert.doesNotMatch(calibration,/statRaw>=\.95&&\(statChanged\|\|statStrengthened\)/);
  assert.match(calibration,/statComponents\.fieldConsistency=statChanged\?\.9:1/);
});