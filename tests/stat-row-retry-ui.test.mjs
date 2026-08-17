import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const refinement=read('../src/import/emblemOcrRefinement.ts');
const boardView=read('../src/ui/boardView.ts');

test('low-confidence stat uses one bounded PSM6 retry aligned to localization evidence',()=>{
  assert.match(refinement,/cardAlignedStat=metrics\.diagnostic\.extractionColumnMethod==='role-labels'/);
  assert.match(refinement,/statLeft=cardAlignedStat\?Math\.max\(roleBand\.left,d\.roi\.left-d\.roi\.width\*\.08\):roleBand\.left/);
  assert.match(refinement,/statWidth=cardAlignedStat\?Math\.max\(1,roleBand\.right-statLeft\):\(roleBand\.right-roleBand\.left\)\*\.78/);
  assert.match(refinement,/nameRoi=\{left:statLeft,top:d\.roi\.top,width:statWidth,height:d\.roi\.height\}/);
  assert.match(refinement,/statStrip=extractionToSource\(nameRoi,metrics\)/);
  assert.match(refinement,/statCanvas=canvas\(src,statStrip\)/);
  assert.match(refinement,/stat:\$\{role\}:\$\{i\+1\}:psm6/);
  assert.match(refinement,/acceptsStatEvidence\(sm\.score,sc,sm\.score-sm\.runnerUpScore\)/);
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:otsu/);
  assert.doesNotMatch(refinement,/stat:\$\{role\}:\$\{i\+1\}:raw/);
});

test('dedicated tier OCR runs only while Tier evidence remains unresolved or ambiguous',()=>{
  assert.match(refinement,/\(!tier\.direct\|\|tier\.match\.value===1\|\|tier\.match\.score<\.9\)&&!strongSupplementalTier&&shouldRetryTier\(confidenceFor\(raw,qp\)\)/);
});

test('successful stat retries synchronize final diagnostic stat values',()=>{
  assert.match(refinement,/d\.normalizedStat=sm\.value;d\.statMatchScore=sm\.score/);
});

test('Madstone keeps its engine key while displaying the client label',()=>{
  assert.match(boardView,/stat === 'Madstone' \? 'Madstone Collected' : stat/);
  assert.match(boardView,/value="\$\{escapeHtml\(stat\)\}"/);
  assert.match(boardView,/escapeHtml\(statDisplayName\(stat\)\)/);
});