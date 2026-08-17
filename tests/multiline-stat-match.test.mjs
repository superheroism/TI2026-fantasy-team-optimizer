import test from 'node:test';
import assert from 'node:assert/strict';
import { matchStatLines } from '../build/js/import/ocrDomainMatch.js';
import { LEGAL_STAT_POOLS } from '../build/js/domain/rules.js';

test('multiline stat matcher joins corrupted Madstone and Collected across OCR lines',()=>{
  const result=matchStatLines(['noise','MADST0NE 150%','COLLECTED'],LEGAL_STAT_POOLS.red);
  assert.equal(result.value,'Madstone');
  assert.ok(result.score>=.92);
  assert.deepEqual(result.lineIndices,[1,2]);
});

test('multiline stat matcher tolerates percentage on its own OCR line',()=>{
  const result=matchStatLines(['noise','MADST0NE','150%','COLLECTED'],LEGAL_STAT_POOLS.red);
  assert.equal(result.value,'Madstone');
  assert.ok(result.score>=.92);
});

test('single-line stats retain normal matching behavior',()=>{
  const result=matchStatLines(['TOWER KILLS 270%','TIER V 150%','FRIENDLY 20%'],LEGAL_STAT_POOLS.red);
  assert.equal(result.value,'Tower Kills');
  assert.ok(result.score>=.99);
});

test('weak unrelated multiline OCR does not become a strong Madstone match',()=>{
  const result=matchStatLines(['lew 150%','TIER II 30%','FRIENDLY 20%'],LEGAL_STAT_POOLS.red);
  assert.ok(result.score<.92);
});
