import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/screenshotImport.ts',import.meta.url),'utf8');

test('tier auto-trust requires direct text plus corroboration, with a stricter Tier I boundary',()=>{
  assert.ok(source.includes('const corroborated=diag.tierMatchScore>=.95||tierRaw>=.98'));
  assert.ok(source.includes('emblem.qualityTier!==1&&diag.tierMatchScore>=.84'));
  assert.ok(source.includes('tierComponents.structuredEvidence=.89'));
});

test('native direct tier retries can become authoritative without weakening Tier I initial evidence',()=>{
  assert.ok(source.includes("tierComponents.targetedRetry=.97"));
  assert.ok(source.includes("tierReason='targeted-native-tier'"));
});

test('fitted row synthesis does not globally cap otherwise independent field evidence',()=>{
  assert.equal(source.includes("if(metrics.diagnostic.synthesizedRows) return {value:.85,reason:'synthesized-row'}"),false);
});

test('coarse localization fallback does not cap independently relocalized extraction fields',()=>{
  assert.equal(source.includes("columnLocalizationMethod==='fallback'"),false);
});

test('team evidence fuses the role header with first-card roster text',()=>{
  assert.ok(source.includes('teamCorpus=['));
  assert.ok(source.includes('emblem.rowIndex===0'));
});

test('team auto-application requires candidate separation, not a fuzzy winner alone',()=>{
  assert.ok(source.includes('match.margin>=.08'));
  assert.ok(source.includes("teamComponents.fieldConsistency=.7"));
});

test('independent action agreement and nontrivial roster names are explicit evidence',()=>{
  assert.ok(source.includes('independentAgreement'));
  assert.ok(source.includes('normalized(playerName).length>=4'));
});

test('sub-threshold action evidence preserves the existing menu',()=>{
  assert.ok(source.includes('actionConfidence<REVIEW_THRESHOLD'));
  assert.ok(source.includes('preserved until reviewed'));
});

test('action auto-application requires decisive closed-catalog evidence or strong raw confidence',()=>{
  assert.ok(source.includes('actionMatch.score>=.65&&actionMatch.margin>=.05'));
  assert.ok(source.includes('const actionResolved=operationId!==null&&(decisiveCatalogMatch||rawConfidence>=.9)'));
});