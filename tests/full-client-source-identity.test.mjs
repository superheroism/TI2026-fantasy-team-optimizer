import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const identity=JSON.parse(await readFile(new URL('./fixtures/full-client-source-identity.json',import.meta.url),'utf8'));
const corpus=JSON.parse(await readFile(new URL('./fixtures/screenshot-corpus-ground-truth.json',import.meta.url),'utf8'));

test('full-client source identity matches the seventh corpus fixture',()=>{
  const fixture=corpus.fixtures.find(candidate=>candidate.id===identity.fixtureId);
  assert.ok(fixture);
  assert.equal(fixture.source.fileName,identity.fileName);
  assert.equal(fixture.source.width,identity.width);
  assert.equal(fixture.source.height,identity.height);
  assert.equal(fixture.source.sha256,identity.sha256);
});
