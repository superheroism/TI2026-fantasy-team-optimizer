import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
test('full-emblem direct textual Tier evidence updates the value before retry gating',()=>{assert.ok(source.includes('if(tier.direct&&tierConfidence>confidenceFor(raw,qp))'));assert.ok(source.indexOf('qualityTier=tier.match.value')<source.indexOf('!tier.direct&&!strongSupplementalTier&&shouldRetryTier'));});
test('one-pass direct Tier recovery stays below auto-trust confidence',()=>{assert.ok(source.includes('Math.min(.84,tierConfidence)'));});
