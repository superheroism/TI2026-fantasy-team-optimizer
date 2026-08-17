import test from 'node:test';
import assert from 'node:assert/strict';
import { otsuThreshold, otsuWhitenessRgba, whitenessValues } from '../build/js/import/ocrImagePreprocess.js';
import { readFileSync } from 'node:fs';

const rgba = pixels => new Uint8ClampedArray(pixels.flatMap(([r,g,b,a=255])=>[r,g,b,a]));

test('whiteness uses the darkest RGB channel rather than luminance',()=>{
  const values=whitenessValues(rgba([[220,220,220],[60,180,80],[80,110,210],[190,70,70]]));
  assert.deepEqual([...values],[220,60,80,70]);
});

test('Otsu separates a bimodal low/high intensity population',()=>{
  const values=new Uint8Array([15,18,20,22,24,225,230,235,240,245]);
  const threshold=otsuThreshold(values);
  assert.ok(threshold>=24&&threshold<225,`unexpected threshold ${threshold}`);
});

test('whiteness Otsu produces dark text from bright low-saturation pixels on colored backgrounds',()=>{
  const source=rgba([
    [35,85,145],[45,130,70],[150,55,60],
    [232,230,228],[240,242,239],[225,228,230],
  ]);
  const result=otsuWhitenessRgba(source);
  const gray=[];
  for(let i=0;i<result.rgba.length;i+=4)gray.push(result.rgba[i]);
  assert.deepEqual(gray.slice(0,3),[255,255,255]);
  assert.deepEqual(gray.slice(3),[0,0,0]);
  assert.ok(result.contrastHigh>result.contrastLow);
});

test('stat-specific fallback uses strict Otsu first and delegates acceptance to the frozen P51 policy',()=>{
  const refinement=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
  assert.doesNotMatch(refinement,/statStrip=/);
  assert.match(refinement,/runStatRepresentationFallbacks\(/);
  assert.match(refinement,/processed=otsuCanvas\(rawStatCanvas\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.match(refinement,/acceptsStatEvidence\(sm\.score,sc\)/);
});
