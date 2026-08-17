import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calibrateConfidenceEvidence } from '../build/js/import/screenshotImport.js';

test('screenshots with no direct per-column Tier rows are geometry-capped below auto-trust',async()=>{
  const source=await readFile(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');
  assert.match(source,/directTierRowCount/);
  assert.match(source,/tierRowsByColumn/);
  assert.match(source,/directTierRowCount===0/);
  assert.match(source,/value:\.84,reason:'geometry-fallback'/);

  const field=calibrateConfidenceEvidence('field',{
    resolved:true,
    rawConfidence:.99,
    reason:'exact-domain-stat',
    components:{geometry:.84,domainMatch:1,structuredEvidence:.98,targetedRetry:0,fieldConsistency:1},
  });
  assert.equal(field.confidence,.84);
  assert.ok(field.confidence<.9);
});
