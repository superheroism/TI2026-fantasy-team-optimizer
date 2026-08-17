import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');

test('tier auto-trust requires direct text plus corroboration, with a stricter Tier I boundary',()=>{
  assert.ok(source.includes('const corroborated=diag.tierMatchScore>=.95||tierRaw>=.98'));
  assert.ok(source.includes('emblem.qualityTier!==1&&diag.tierMatchScore>=.84'));
  assert.ok(source.includes('tierComponents.structuredEvidence=.89'));
});

test('sub-threshold action evidence preserves the existing menu',()=>{
  assert.ok(source.includes('actionConfidence<REVIEW_THRESHOLD'));
  assert.ok(source.includes('preserved until reviewed'));
});

test('action auto-application requires decisive closed-catalog evidence or strong raw confidence',()=>{
  assert.ok(source.includes('actionMatch.score>=.7&&actionMatch.margin>=.06'));
  assert.ok(source.includes('const actionResolved=operationId!==null&&(decisiveCatalogMatch||rawConfidence>=.9)'));
});
