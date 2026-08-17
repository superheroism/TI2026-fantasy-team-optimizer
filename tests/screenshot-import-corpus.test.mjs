import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ACTION_CATALOG } from '../build/js/data/actionCatalog.js';

const corpus=JSON.parse(await readFile(new URL('./fixtures/screenshot-corpus-ground-truth.json',import.meta.url),'utf8'));
const actionIds=new Set(ACTION_CATALOG.map(action=>action.id));

test('screenshot OCR corpus covers both layouts and action visibility states',()=>{
  assert.equal(corpus.schemaVersion,2);
  assert.equal(corpus.fixtures.length,7);
  assert.ok(corpus.fixtures.some(f=>f.layoutId==='legacy_3'));
  assert.ok(corpus.fixtures.some(f=>f.layoutId==='expanded_5'));
  assert.ok(corpus.fixtures.some(f=>f.actionsVisible===true));
  assert.ok(corpus.fixtures.some(f=>f.actionsVisible===false));
});

test('action-visible screenshot fixtures use the canonical action catalog in displayed order',()=>{
  const visible=corpus.fixtures.filter(f=>f.actionsVisible);
  assert.equal(visible.length,3);
  assert.deepEqual(visible.map(f=>f.tokensRemaining).sort((a,b)=>a-b),[4,5,30]);
  for(const fixture of visible){
    assert.equal(fixture.actions.length,3,fixture.id);
    assert.equal(new Set(fixture.actions.map(a=>a.id)).size,3,fixture.id);
    for(const action of fixture.actions){
      assert.ok(actionIds.has(action.id),`${fixture.id}: unknown action ${action.id}`);
      assert.equal(ACTION_CATALOG.find(candidate=>candidate.id===action.id)?.label,action.label,`${fixture.id}: label drift for ${action.id}`);
    }
  }
});

test('corpus emblem counts match the declared board layout',()=>{
  for(const fixture of corpus.fixtures){
    const expected=fixture.layoutId==='expanded_5'?5:3;
    for(const role of ['core','mid','support']) assert.equal(fixture.banners[role].emblems.length,expected,`${fixture.id}: ${role}`);
  }
});

test('latest full-client capture is identity-pinned and uses current Team Vision roster mapping',()=>{
  const fixture=corpus.fixtures.find(f=>f.id==='expanded5-actions-full-client-noone-2048x1151');
  assert.ok(fixture);
  assert.deepEqual(fixture.source,{
    fileName:'TI2026 - Board 2.png',
    width:2048,
    height:1151,
    sha256:'9b3fc2aed9375a49f3cdce2ffffff0e79cb357feb5054e040cb55d5a1ae2c5d2',
    note:'Full Dota client capture supplied during retry-performance validation; binary source remains external to repository CI.',
  });
  assert.equal(fixture.banners.core.expectedTeam,'Team Vision');
  assert.equal(fixture.banners.mid.expectedTeam,'Team Vision');
  assert.equal(fixture.banners.mid.visibleSelectionText,'No[o]ne-');
  assert.equal(fixture.banners.support.expectedTeam,'Team Liquid');
});
