import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');

test('ambiguous direct Tier-I glyph retry is structurally narrow, direct-evidence-only, and fail-closed',()=>{
  assert.match(source,/const TIER_GLYPH_RETRY_CONFIDENCE_CEILING=60/);
  assert.match(source,/!tier\.direct\|\|tier\.match\.value!==1\|\|!tier\.line/);
  assert.match(source,/confused==='I'&&glyphWord\.confidence<TIER_GLYPH_RETRY_CONFIDENCE_CEILING/);
  assert.match(source,/tightRight=Math\.min\(src\.naturalWidth,sourceLeft\+localRight\)/);
  assert.match(source,/tightBottom=Math\.min\(src\.naturalHeight,sourceTop\+localBottom\)/);
  assert.match(source,/if\(tightWidth>0&&tightHeight>0\)/);
  assert.match(source,/tightTierCanvas=otsuCanvas\(canvas\(src,tightTierStrip\)\)/);
  assert.match(source,/`tier:\$\{role\}:\$\{i\+1\}:glyph`/);
  assert.match(source,/tightTier\.direct&&tightTierConfidence>tierConfidence/);
  assert.match(source,/Math\.min\(\.84,tightTierConfidence\)/);
  assert.equal((source.match(/`tier:\$\{role\}:\$\{i\+1\}:glyph`/g)??[]).length,1);
  assert.doesNotMatch(source,/percentage.*tier|tier.*percentage/i);
});
