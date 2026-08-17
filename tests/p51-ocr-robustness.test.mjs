import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { createOcrExecutionBudget, recognizeWithBudget } from '../build/js/import/ocrRecognition.js';
import { selectCoherentRoleTriplet } from '../build/js/import/roleColumnGeometry.js';
import { acceptsStatEvidence, runStatRepresentationFallbacks, shouldRetryStat, shouldRetryTier } from '../build/js/import/ocrRetryPolicy.js';

test('role localization selects a coherent CORE/MID/SUPPORT row over navigation and footer distractors',()=>{
  const selected=selectCoherentRoleTriplet([
    {role:'support',x:55,y:250,confidence:99,similarity:1},
    {role:'core',x:520,y:620,confidence:99,similarity:1},
    {role:'core',x:220,y:82,confidence:88,similarity:.96},
    {role:'mid',x:520,y:84,confidence:86,similarity:.98},
    {role:'support',x:820,y:81,confidence:87,similarity:.97},
  ],1000,700);
  assert.ok(selected);
  assert.equal(selected.core.x,220);
  assert.equal(selected.mid.x,520);
  assert.equal(selected.support.x,820);
});

test('hung recognize call times out, records the exact stage, and invokes worker reset',async()=>{
  const budget=createOcrExecutionBudget(100,15);
  let resetCalls=0;
  const worker={
    recognize:()=>new Promise(()=>{}),
    setParameters:async()=>{},
  };
  const result=await recognizeWithBudget(
    worker,
    {},
    budget,
    {stage:'stat:core:3:raw',psm:7,crop:{left:10,top:20,width:30,height:40},canvasWidth:30,canvasHeight:40},
    {tessedit_pageseg_mode:'7'},
    {tsv:true},
    ()=>{resetCalls++;},
  );
  assert.equal(result.data.tsv,'');
  assert.equal(resetCalls,1);
  assert.equal(budget.exhausted,true);
  assert.equal(budget.calls.length,1);
  assert.deepEqual(budget.calls[0],{
    stage:'stat:core:3:raw',
    psm:'7',
    crop:{left:10,top:20,width:30,height:40},
    canvasWidth:30,
    canvasHeight:40,
    pixelCount:1200,
    elapsedMs:budget.calls[0].elapsedMs,
    wordCount:0,
    outcome:'timeout',
    timeoutReason:'call-timeout',
  });
  assert.ok(budget.calls[0].elapsedMs>=0);
});

test('successful recognition diagnostics capture word count and crop geometry',async()=>{
  const budget=createOcrExecutionBudget(1000,100);
  const tsv='level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n5\t1\t1\t1\t1\t1\t0\t0\t10\t10\t95\tROSHAN';
  const worker={recognize:async()=>({data:{tsv}}),setParameters:async()=>{}};
  await recognizeWithBudget(worker,{},budget,{stage:'localization',psm:3,crop:{left:0,top:0,width:3719,height:1827},canvasWidth:1100,canvasHeight:540});
  assert.equal(budget.calls[0].outcome,'success');
  assert.equal(budget.calls[0].wordCount,1);
  assert.equal(budget.calls[0].pixelCount,594000);
});

test('Otsu success skips raw stat OCR; Otsu failure falls through to raw',async()=>{
  let confidence=.2;
  const successCalls=[];
  const success=await runStatRepresentationFallbacks(
    ()=>confidence,
    async()=>{successCalls.push('otsu');confidence=.90;},
    async()=>{successCalls.push('raw');confidence=.95;},
  );
  assert.deepEqual(successCalls,['otsu']);
  assert.deepEqual(success,{usedOtsu:true,usedRaw:false});

  confidence=.2;
  const fallbackCalls=[];
  const fallback=await runStatRepresentationFallbacks(
    ()=>confidence,
    async()=>{fallbackCalls.push('otsu');confidence=.899;},
    async()=>{fallbackCalls.push('raw');confidence=.94;},
  );
  assert.deepEqual(fallbackCalls,['otsu','raw']);
  assert.deepEqual(fallback,{usedOtsu:true,usedRaw:true});
});

test('P51 preserves the stat and Tier confidence gates',()=>{
  assert.equal(acceptsStatEvidence(.92,.90),true);
  assert.equal(acceptsStatEvidence(.919999,.90),false);
  assert.equal(acceptsStatEvidence(.92,.899999),false);
  assert.equal(shouldRetryStat(.90),false);
  assert.equal(shouldRetryStat(.899999),true);
  assert.equal(shouldRetryTier(.90),false);
  assert.equal(shouldRetryTier(.899999),true);
});

test('initial extraction and targeted refinement contain no direct Tesseract recognize calls',async()=>{
  const [initial,refinement]=await Promise.all([
    readFile(new URL('../src/import/localScreenshotOcr.ts',import.meta.url),'utf8'),
    readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8'),
  ]);
  assert.equal(initial.includes('.recognize('),false);
  assert.equal(refinement.includes('.recognize('),false);
  assert.ok(refinement.includes('stat:${role}:${i+1}:psm6'));
  assert.equal(refinement.includes('stat:${role}:${i+1}:otsu'),false);
  assert.equal(refinement.includes('stat:${role}:${i+1}:raw'),false);
});
