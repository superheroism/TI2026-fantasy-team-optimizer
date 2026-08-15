import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scoring=readFileSync(new URL('../src/engine/scoring.ts',import.meta.url),'utf8');
const app=readFileSync(new URL('../src/ui/app.ts',import.meta.url),'utf8');

test('team comparison cache is independent of selectedTeam when banner mechanics are unchanged',()=>{
  const start=scoring.indexOf('export function rankTeamsForRole');
  const end=scoring.indexOf('function selectedProfile',start);
  const block=scoring.slice(start,end);
  const keyLine=block.split('\n').find(line=>line.includes('const key='))??'';

  assert.match(keyLine,/bannerMechanicsKey\(banner/);
  assert.equal(keyLine.includes('selectedTeam'),false);
});

test('team-only changes preserve and immediately re-highlight the likely-results comparison',()=>{
  const start=app.indexOf('function bindDynamic()');
  const end=app.indexOf('function advanceToNextRoll',start);
  const block=app.slice(start,end);
  assert.match(block,/\.team-select/);
  assert.match(block,/markStale\(true\)/);
  assert.match(block,/renderTeamComparison\(changedRole\)/);
});
