import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');

test('full-emblem direct textual Tier evidence updates the value before ambiguity-aware retry gating',()=>{
  assert.ok(source.includes('if(tier.direct&&tierConfidence>confidenceFor(raw,qp))'));
  const retryGate='(!tier.direct||tier.match.value===1||tier.match.score<.9)&&!strongSupplementalTier&&shouldRetryTier';
  assert.ok(source.indexOf('qualityTier=tier.match.value')<source.indexOf(retryGate));
});

test('one-pass direct Tier recovery stays below auto-trust confidence',()=>{
  assert.ok(source.includes('Math.min(.84,tierConfidence)'));
});