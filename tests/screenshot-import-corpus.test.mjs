import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import test from 'node:test';
import { ACTION_CATALOG } from '../build/js/data/actionCatalog.js';

const directory = new URL('./test_boards/', import.meta.url);
const roles = ['core','mid','support'];
const actionIds = new Set(ACTION_CATALOG.map(action=>action.id));

function containsPercentageKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key,child]) =>
    /percent|percentage|multiplier|bonus/i.test(key) || containsPercentageKey(child)
  );
}

async function loadCorpus() {
  const names = (await readdir(directory)).filter(name=>name.endsWith('.ground-truth.json')).sort();
  return await Promise.all(names.map(async name=>({
    name,
    truth:JSON.parse(await readFile(new URL(name,directory),'utf8')),
  })));
}

const corpus = await loadCorpus();

test('P52 real-image OCR corpus has exactly six one-to-one ground-truth sidecars', async()=>{
  assert.equal(corpus.length,6);
  const images = (await readdir(directory)).filter(name=>/\.(png|webp)$/i.test(name)).sort();
  assert.equal(images.length,6);
  assert.deepEqual(corpus.map(row=>row.truth.sourceFile).sort(),images);
  for(const {truth} of corpus) assert.ok((await stat(new URL(truth.sourceFile,directory))).size>0,truth.sourceFile);
});

test('P52 ground truth covers five expanded boards and one legacy board without percentage-derived fields',()=>{
  assert.deepEqual(
    corpus.map(row=>row.truth.layoutId).sort(),
    ['expanded_5','expanded_5','expanded_5','expanded_5','expanded_5','legacy_3'],
  );
  for(const {name,truth} of corpus){
    assert.equal(truth.schemaVersion,1,name);
    assert.equal(containsPercentageKey(truth),false,`${name}: percentage-derived evidence is forbidden`);
    const expectedSlots=truth.layoutId==='expanded_5'?5:3;
    for(const role of roles){
      assert.equal(typeof truth.banners[role].visibleSelectionText,'string',`${name}: ${role} roster text`);
      assert.equal(truth.banners[role].emblems.length,expectedSlots,`${name}: ${role} slot count`);
      for(const emblem of truth.banners[role].emblems){
        assert.ok(emblem.visibleStat,`${name}: missing visible stat`);
        assert.ok(emblem.stat,`${name}: missing normalized stat`);
        assert.ok(Number.isInteger(emblem.qualityTier)&&emblem.qualityTier>=1&&emblem.qualityTier<=5,`${name}: tier`);
        assert.ok(['Fractal','Friendly','Vampiric','Unique','Benevolent'].includes(emblem.trait),`${name}: trait`);
      }
    }
    assert.equal(truth.actions.length,3,`${name}: actions`);
    for(const action of truth.actions){
      assert.ok(action.visibleLabel,`${name}: missing visible action label`);
      assert.ok(actionIds.has(action.id),`${name}: unknown action ${action.id}`);
    }
    assert.ok(Number.isInteger(truth.tokensRemaining)&&truth.tokensRemaining>=0,`${name}: tokens`);
  }
});

test('low-resolution stress annotation is isolated to Board 4',()=>{
  const stressed=corpus.filter(row=>row.truth.stressCase);
  assert.equal(stressed.length,1);
  assert.equal(stressed[0].truth.sourceFile,'Ti2026 - board 4.png');
  assert.equal(stressed[0].truth.stressCase,'low-resolution');
});
