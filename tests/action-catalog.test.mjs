import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTION_CATALOG, ACTION_APPEARANCE_PROBABILITY, TOTAL_UNIFORM_MENUS, allUniformMenus } from '../docs/js/data/actionCatalog.js';

test('TI 2026 action catalogue contains 20 distinct actions',()=>{
  assert.equal(ACTION_CATALOG.length,20);
  assert.equal(new Set(ACTION_CATALOG.map(x=>x.id)).size,20);
});

test('uniform menu model produces 20 choose 3 = 1140 unique menus without duplicates',()=>{
  const menus=allUniformMenus();
  assert.equal(menus.length,TOTAL_UNIFORM_MENUS);
  const keys=new Set(menus.map(m=>m.map(x=>x.id).sort().join('|')));
  assert.equal(keys.size,1140);
  assert.ok(menus.every(m=>new Set(m.map(x=>x.id)).size===3));
});

test('each action appears in 15 percent of uniform menus',()=>{
  const menus=allUniformMenus();
  for(const action of ACTION_CATALOG){
    const count=menus.filter(m=>m.some(x=>x.id===action.id)).length;
    assert.equal(count/menus.length,ACTION_APPEARANCE_PROBABILITY);
    assert.equal(count,171);
  }
});
