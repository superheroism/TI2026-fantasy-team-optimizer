import test from 'node:test';
import assert from 'node:assert/strict';
import { matchActionText, matchStatText, matchStatTextWithMargin, matchTierText, matchTraitText } from '../docs/js/import/ocrDomainMatch.js';

test('token-aware emblem matching preserves strong OCR evidence inside noisy card text', () => {
  assert.deepEqual(matchStatText('TERY, FRIENDLY. DEATHS 190% “100% 0%', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'Deaths', score:1 });
  assert.deepEqual(matchStatText('® Tier VAMPIRIC GPM 170% a0 “ox', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'GPM', score:1 });
  assert.equal(matchTraitText('TERY, FRIENDLY. DEATHS 190% “100% 0%').value, 'Friendly');
  assert.equal(matchTraitText('® Tier VAMPIRIC GPM 170% a0 “ox').value, 'Vampiric');
});

test('stat matcher exposes decisive same-color candidate separation without changing the public result', () => {
  const separated=matchStatTextWithMargin('TEAFIGHT PARTICIPATION', ['Teamfight Participation','Tormentor Kills','Roshan Kills','Stuns','Courier Kills','First Blood']);
  assert.equal(separated.value,'Teamfight Participation');
  assert.ok(separated.score>=.82);
  assert.ok(separated.margin>=.25);
  assert.deepEqual(matchStatText('TEAFIGHT PARTICIPATION', ['Teamfight Participation','Tormentor Kills']), {value:'Teamfight Participation',score:separated.score});
});

test('non-Tier-I Roman evidence may follow trait/stat text while ambiguous Tier I remains weak',()=>{
  assert.deepEqual(matchTierText('TIER BENEVOLENT TEAMFIGHT IV'),{value:4,score:.84});
  assert.deepEqual(matchTierText('TIER UNIQUE TEAMFIGHT II'),{value:2,score:.84});
  assert.deepEqual(matchTierText('TIER FRIENDLY TEAMFIGHT I'),{value:1,score:.2});
});

test('percentage bonuses are never direct quality-tier evidence', () => {
  for (const text of ['10%','30%','60%','100%','150%','© TER unique Mm 1 130% ox sox','TERY, FRIENDLY. DEATHS 190% “100% 0%']) {
    assert.ok(matchTierText(text).score < .9, text);
  }
  assert.deepEqual(matchTierText('TER VAMPIRIC Ns in 200% woox ox'), { value:1, score:.2 });
});

test('tier token evidence supports adjacent Roman/digit OCR while separated evidence excludes Tier I', () => {
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

test('action matcher reports candidate separation for evidence-based application', () => {
  for (const text of [
    'REROLL LAST GREEN STAT F E',
    'TAD é ERC IN EN RANDOM REROLL STAT GREE',
    'OLL TRAIT FOR THE RA RST BLUE EMBLEM',
    'OR RED REROLL TRAT 1S EMBLE',
  ]) {
    const match=matchActionText(text);
    assert.ok(match, text);
    assert.ok(match.score >= match.runnerUpScore, text);
    assert.ok(match.margin > 0, text);
    assert.equal(match.margin, match.score-match.runnerUpScore);
  }
});

test('action matcher preserves scope and kind discriminators in noisy dedicated button OCR', () => {
  assert.equal(matchActionText('OLL TRAIT FOR THE RA RST BLUE EMBLEM')?.id, 'blue-trait-first');
  assert.equal(matchActionText('OR RED REROLL TRAT 1S EMBLE')?.id, 'red-trait-all');
  const clippedQuality=matchActionText('AIT FOR RED REROLL QU LEMS RANDOM');
  assert.equal(clippedQuality?.id, 'red-quality-random');
  assert.ok((clippedQuality?.score ?? 0) >= .65);
  assert.ok((clippedQuality?.margin ?? 0) >= .05);
});

test('tier matcher accepts punctuation-stripped adjacent roman evidence', () => {
  assert.deepEqual(matchTierText('TIER IV)'), { value:4, score:.86 });
  assert.deepEqual(matchTierText('TIER II UNIQUE'), { value:2, score:.86 });
});
