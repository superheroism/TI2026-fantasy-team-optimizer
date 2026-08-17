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

test('weak-stat refinement uses one bounded PSM6 retry aligned to localization evidence',()=>{
  const refinement=readFileSync(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
  assert.match(refinement,/cardAlignedStat=metrics\.diagnostic\.extractionColumnMethod==='role-labels'/);
  assert.match(refinement,/statLeft=cardAlignedStat\?Math\.max\(roleBand\.left,d\.roi\.left-d\.roi\.width\*\.08\):roleBand\.left/);
  assert.match(refinement,/statWidth=cardAlignedStat\?Math\.max\(1,roleBand\.right-statLeft\):\(roleBand\.right-roleBand\.left\)\*\.78/);
  assert.match(refinement,/nameRoi=\{left:statLeft,top:d\.roi\.top,width:statWidth,height:d\.roi\.height\}/);
  assert.match(refinement,/statStrip=extractionToSource\(nameRoi,metrics\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:psm6/);
  assert.ok(refinement.includes("acceptsStatEvidence(sm.score,sc,sm.score-sm.runnerUpScore,sm.value.replace(/[^A-Za-z0-9]/g,'').length,confidenceFor(raw,sp))"));
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:raw/);
});
