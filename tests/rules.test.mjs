import test from 'node:test';import assert from 'node:assert/strict';import { isLegalStat, legalStats } from '../docs/js/domain/rules.js';
test('same-color stat legality is enforced',()=>{assert.equal(isLegalStat('blue','Runes'),true);assert.equal(isLegalStat('blue','GPM'),false);assert.equal(legalStats('red').includes('Teamfight Participation'),false);});
