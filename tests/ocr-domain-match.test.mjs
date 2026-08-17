import test from 'node:test';
import assert from 'node:assert/strict';
import { matchActionText, matchStatText, matchTierText, matchTraitText } from '../docs/js/import/ocrDomainMatch.js';

test('token-aware emblem matching preserves strong OCR evidence inside noisy card text', () => {
  assert.deepEqual(matchStatText('TERY, FRIENDLY. DEATHS 190% “100% 0%', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'Deaths', score:1 });
  assert.deepEqual(matchStatText('® Tier VAMPIRIC GPM 170% a0 “ox', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'GPM', score:1 });
  assert.equal(matchTraitText('TERY, FRIENDLY. DEATHS 190% “100% 0%').value, 'Friendly');
  assert.equal(matchTraitText('® Tier VAMPIRIC GPM 170% a0 “ox').value, 'Vampiric');
});

test('percentage bonuses are never direct quality-tier evidence', () => {
  for (const text of ['10%','30%','60%','100%','150%','© TER unique Mm 1 130% ox sox','TERY, FRIENDLY. DEATHS 190% “100% 0%']) {
    assert.ok(matchTierText(text).score < .9, text);
  }
  assert.deepEqual(matchTierText('TER VAMPIRIC Ns in 200% woox ox'), { value:1, score:.2 });
});

test('tier token evidence supports roman and digit OCR only when adjacent to a TIER-like token', () => {
  assert.deepEqual(matchTierText('TER IV junk'), { value:4, score:.86 });
  assert.deepEqual(matchTierText('TER 1 junk'), { value:1, score:.72 });
  assert.deepEqual(matchTierText('random 4 junk'), { value:1, score:.2 });
});

test('direct Tier evidence survives OCR token fusion without using percentage text', () => {
  assert.deepEqual(matchTierText('TiERv FRACTAL'), {value:5,score:.86});
  assert.deepEqual(matchTierText('TIERIV VAMPIRIC'), {value:4,score:.86});
  assert.deepEqual(matchTierText('TIER5 FRIENDLY'), {value:5,score:.72});
});

test('action matcher resolves the three noisy live-corpus action strings', () => {
  assert.equal(matchActionText('REROLL LAST GREEN STAT F E')?.id, 'green-stat-last');
  const quality = matchActionText('RANDOMLY \"od ne QUALIT INCH');
  assert.equal(quality?.id, 'quality-increase-one');
  assert.ok((quality?.score ?? 0) >= .58);
  assert.equal(matchActionText('TAD é ERC IN EN RANDOM REROLL STAT GREE')?.id, 'green-stat-random');
});


test('action matcher preserves scope and kind discriminators in noisy dedicated button OCR', () => {
  assert.equal(matchActionText('OLL TRAIT FOR THE RA RST BLUE EMBLEM')?.id, 'blue-trait-first');
  assert.equal(matchActionText('OR RED REROLL TRAT 1S EMBLE')?.id, 'red-trait-all');
  assert.equal(matchActionText('AIT FOR RED REROLL QU LEMS RANDOM')?.id, 'red-quality-random');
});

test('tier matcher accepts punctuation-stripped roman evidence only next to TIER', () => {
  assert.deepEqual(matchTierText('TIER IV)'), { value:4, score:.86 });
  assert.deepEqual(matchTierText('TIER II UNIQUE'), { value:2, score:.86 });
});
