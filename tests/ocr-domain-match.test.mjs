import test from 'node:test';
import assert from 'node:assert/strict';
import { matchActionText, matchStatText, matchTierText, matchTraitText } from '../docs/js/import/ocrDomainMatch.js';

test('token-aware emblem matching preserves strong OCR evidence inside noisy card text', () => {
  assert.deepEqual(matchStatText('TERY, FRIENDLY. DEATHS 190% “100% 0%', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'Deaths', score:1 });
  assert.deepEqual(matchStatText('® Tier VAMPIRIC GPM 170% a0 “ox', ['Creep Score','GPM','Deaths','Tower Kills']), { value:'GPM', score:1 });
  assert.equal(matchTraitText('TERY, FRIENDLY. DEATHS 190% “100% 0%').value, 'Friendly');
  assert.equal(matchTraitText('® Tier VAMPIRIC GPM 170% a0 “ox').value, 'Vampiric');
});

test('quality matching never accepts a valid bonus as a substring of an unrelated percentage', () => {
  const badSubstring = matchTierText('© TER unique Mm 1 130% ox sox');
  assert.equal(badSubstring.value, 1);
  assert.ok(badSubstring.score < .9);
  assert.deepEqual(matchTierText('TERY, FRIENDLY. DEATHS 190% “100% 0%'), { value:4, score:.99 });
  assert.deepEqual(matchTierText('TER VAMPIRIC Ns in 200% woox ox'), { value:1, score:.2 });
});

test('tier token evidence supports roman and digit OCR only when adjacent to a TIER-like token', () => {
  assert.deepEqual(matchTierText('TER IV junk'), { value:4, score:.86 });
  assert.deepEqual(matchTierText('TER 1 junk'), { value:1, score:.72 });
  assert.deepEqual(matchTierText('random 4 junk'), { value:1, score:.2 });
});

test('action matcher resolves the three noisy live-corpus action strings', () => {
  assert.equal(matchActionText('REROLL LAST GREEN STAT F E')?.id, 'green-stat-last');
  assert.equal(matchActionText('RANDOMLY "od ne QUALIT INCH')?.id, 'quality-increase-one');
  assert.equal(matchActionText('TAD é ERC IN EN RANDOM REROLL STAT GREE')?.id, 'green-stat-random');
});
