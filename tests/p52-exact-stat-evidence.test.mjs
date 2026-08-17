import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptsStatEvidence,
  EXACT_STAT_CONFIDENCE_GATE,
  FUZZY_STAT_CONFIDENCE_GATE,
  FUZZY_STAT_MARGIN_GATE,
  FUZZY_STAT_MATCH_GATE,
  LONG_TOKEN_STAT_EXISTING_CONFIDENCE_CEILING,
  LONG_TOKEN_STAT_LENGTH_GATE,
  LONG_TOKEN_STAT_MARGIN_GATE,
} from '../build/js/import/ocrRetryPolicy.js';

test('exact legal stat text can replace weaker evidence without being promoted to review confidence',()=>{
  assert.equal(EXACT_STAT_CONFIDENCE_GATE,.82);
  assert.equal(acceptsStatEvidence(1,.82),true);
  assert.equal(acceptsStatEvidence(1,.819999),false);
  assert.equal(acceptsStatEvidence(.99,.82),false);
  assert.equal(acceptsStatEvidence(.92,.90),true);
});

test('decisive color-constrained fuzzy evidence requires match, margin, and measured-confidence gates',()=>{
  assert.equal(FUZZY_STAT_MATCH_GATE,.70);
  assert.equal(FUZZY_STAT_MARGIN_GATE,.25);
  assert.equal(FUZZY_STAT_CONFIDENCE_GATE,.68);
  assert.equal(acceptsStatEvidence(.78,.72,.35),true);
  assert.equal(acceptsStatEvidence(.69,.72,.35),false);
  assert.equal(acceptsStatEvidence(.78,.72,.24),false);
  assert.equal(acceptsStatEvidence(.78,.67,.35),false);
});

test('long legal stat tokens can use a narrower same-color margin only while the existing field is weak',()=>{
  assert.equal(LONG_TOKEN_STAT_LENGTH_GATE,6);
  assert.equal(LONG_TOKEN_STAT_MARGIN_GATE,.10);
  assert.equal(LONG_TOKEN_STAT_EXISTING_CONFIDENCE_CEILING,.70);
  assert.equal(acceptsStatEvidence(.714,.50,.143,7,0),true);
  assert.equal(acceptsStatEvidence(.714,.50,.143,5,0),false);
  assert.equal(acceptsStatEvidence(.714,.50,.099,7,0),false);
  assert.equal(acceptsStatEvidence(.699,.50,.143,7,0),false);
  assert.equal(acceptsStatEvidence(.714,.50,.143,7,.70),false);
});
