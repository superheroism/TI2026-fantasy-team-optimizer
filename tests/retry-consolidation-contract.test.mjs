import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const refinement=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
const retryPolicy=await readFile(new URL('../src/import/ocrRetryPolicy.ts',import.meta.url),'utf8');

test('P52 retains full-emblem recovery and replaces P51 stat representations with one bounded PSM6 label-row retry',()=>{
  assert.match(refinement,/emblem:\$\{role\}:\$\{i\+1\}:psm6/);
  assert.match(refinement,/statStrip=extractionToSource\(nameRoi,metrics\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:psm6/);
  assert.match(refinement,/acceptsStatEvidence\(sm\.score,sc,sm\.score-sm\.runnerUpScore\)/);
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:raw/);
});

test('P51 keeps strict stat acceptance thresholds centralized and unchanged',()=>{
  assert.match(retryPolicy,/STAT_MATCH_GATE=\.92/);
  assert.match(retryPolicy,/STRUCTURED_CONFIDENCE_GATE=\.90/);
  assert.match(retryPolicy,/matchScore>=STAT_MATCH_GATE&&confidence>=STRUCTURED_CONFIDENCE_GATE/);
});

test('dedicated Tier retry remains bounded to unresolved or ambiguous Tier evidence',()=>{
  assert.match(refinement,/\(!tier\.direct\|\|tier\.match\.value===1\|\|tier\.match\.score<\.9\)&&!strongSupplementalTier&&shouldRetryTier\(confidenceFor\(raw,qp\)\)/);
});

test('a lone direct textual Tier read may recover the value but remains below review confidence',()=>{
  assert.ok(refinement.includes('direct.length===1'));
  assert.ok(refinement.includes('qualityTier=lone.match.value'));
  assert.ok(refinement.includes('Math.min(.84,combined(lone.match.score'));
});