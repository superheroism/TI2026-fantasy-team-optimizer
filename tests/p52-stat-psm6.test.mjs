import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/import/emblemOcrRefinement.ts',import.meta.url),'utf8');
test('weak stats use one bounded native PSM6 retry aligned to observed column geometry',()=>{assert.ok(source.includes('stat:${role}:${i+1}:psm6'));assert.ok(source.includes("cardAlignedStat=metrics.diagnostic.extractionColumnMethod==='role-labels'"));assert.ok(source.includes('statLeft=cardAlignedStat?Math.max(roleBand.left,d.roi.left-d.roi.width*.08):roleBand.left'));assert.ok(source.includes('statWidth=cardAlignedStat?Math.max(1,roleBand.right-statLeft):(roleBand.right-roleBand.left)*.78'));assert.ok(!source.includes('runStatRepresentationFallbacks('));});
test('PSM6 stat recovery still requires centralized structured evidence gates',()=>{assert.ok(source.includes('acceptsStatEvidence(sm.score,sc,sm.score-sm.runnerUpScore)'));});
