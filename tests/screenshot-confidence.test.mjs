import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateConfidenceEvidence, directTierText } from '../build/js/import/screenshotImport.js';

const components=(overrides={})=>({geometry:1,domainMatch:.95,structuredEvidence:0,targetedRetry:0,fieldConsistency:1,...overrides});
const calibrate=(overrides={})=>calibrateConfidenceEvidence('field',{resolved:true,rawConfidence:.45,reason:'raw-ocr',components:components(),...overrides});

test('strong structured evidence can clear review despite weak raw OCR',()=>{
  const field=calibrate({reason:'exact-domain-stat',components:components({domainMatch:1,structuredEvidence:.97})});
  assert.equal(field.reason,'exact-domain-stat');
  assert.equal(field.confidence,.97);
  assert.ok(field.confidence>=.9);
});

test('strong targeted retry can replace weak initial token confidence',()=>{
  const field=calibrate({reason:'direct-native-tier',rawConfidence:.38,components:components({domainMatch:.97,targetedRetry:.97})});
  assert.equal(field.confidence,.97);
  assert.ok(field.confidence>=.9);
});

test('weak correct and ambiguous fuzzy evidence remain review-required',()=>{
  const weak=calibrate({reason:'fuzzy-trait',rawConfidence:.82,components:components({domainMatch:.9})});
  const ambiguous=calibrate({reason:'fuzzy-stat',rawConfidence:.99,components:components({domainMatch:.61})});
  assert.ok(weak.confidence<.9);
  assert.ok(ambiguous.confidence<.9);
});

test('conflicting initial and retry evidence cannot become high confidence',()=>{
  const field=calibrate({reason:'targeted-native-stat',rawConfidence:.98,components:components({domainMatch:.98,targetedRetry:.98,fieldConsistency:.6})});
  assert.equal(field.reason,'conflicting-retry');
  assert.equal(field.confidence,.84);
});

test('geometry fallback and synthesized rows cap otherwise strong evidence',()=>{
  const fallback=calibrate({reason:'geometry-fallback',components:components({geometry:.85,domainMatch:1,structuredEvidence:.98})});
  const synthesized=calibrate({reason:'synthesized-row',components:components({geometry:.85,domainMatch:1,structuredEvidence:.98})});
  assert.equal(fallback.confidence,.85);
  assert.equal(synthesized.confidence,.85);
  assert.ok(fallback.confidence<.9);
  assert.ok(synthesized.confidence<.9);
});

test('unresolved fields are always zero confidence',()=>{
  const field=calibrate({resolved:false,reason:'unresolved',rawConfidence:.99,components:components({domainMatch:1,structuredEvidence:1,targetedRetry:1})});
  assert.equal(field.confidence,0);
  assert.equal(field.reason,'unresolved');
});

test('Tier I direct evidence does not misread Tier II as Tier I',()=>{
  assert.equal(directTierText('TIER I FRIENDLY',1),true);
  assert.equal(directTierText('TIER II FRIENDLY',1),false);
  assert.equal(directTierText('TIER II FRIENDLY',2),true);
});
